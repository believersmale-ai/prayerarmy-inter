// Prayer Army International — Node.js/MySQL host.
//
// Serves the public site, content modules, staff dashboard and public-account API.
// PHP hosting remains available independently; see HOSTINGER-DEPLOY.md.
//
// Environment variables: PORT, DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME,
// ADMIN_EMAIL + ADMIN_INITIAL_PASSWORD (first admin), ADMIN_FORCE_RESET=true (one-off reset),
// ADMIN_PASSKEY (optional shared passkey; there is no default).

import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { randomBytes } from 'node:crypto';
import multer from 'multer';
import { fileTypeFromFile } from 'file-type';
import db from './database.js';
import { createPublicAccountRouter } from './public-auth.js';
import { createStore, route } from './node-common.js';
import { createStaff, hashPassword, sameOrigin } from './node-auth.js';
import { createContent } from './node-content.js';
import { registerMediaPosts } from './media-posts.js';
import { registerPages } from './node-pages.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// PAI_DATA_DIR is an optional, operator-managed directory OUTSIDE Hostinger's versioned builds.
// When unset, retain legacy paths for backward compatibility; do not silently migrate data.
const DATA_DIR = process.env.PAI_DATA_DIR ? path.resolve(process.env.PAI_DATA_DIR) : null;
const BUNDLED_SETTINGS_FILE = path.join(__dirname, 'site-settings.json');
const SETTINGS_FILE = DATA_DIR ? path.join(DATA_DIR, 'site-settings.json') : BUNDLED_SETTINGS_FILE;
const UPLOAD_DIR = DATA_DIR ? path.join(DATA_DIR, 'uploads') : path.join(__dirname, 'assets', 'uploads');
const IMAGES_DIR = path.join(__dirname, 'assets', 'images');

const MEDIA_EXT = {
  image: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'],
  video: ['.mp4', '.webm', '.mov', '.m4v', '.ogv'],
  audio: ['.mp3', '.m4a', '.wav', '.ogg', '.oga', '.aac', '.flac']
};
const mediaTypeOf = (name) => {
  const ext = path.extname(String(name)).toLowerCase();
  return Object.keys(MEDIA_EXT).find((k) => MEDIA_EXT[k].includes(ext)) || null;
};

if (DATA_DIR) {
  if (!path.isAbsolute(process.env.PAI_DATA_DIR)) throw new Error('PAI_DATA_DIR must be an absolute path');
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
// Seed fresh installations only. Existing settings are never overwritten.
if (DATA_DIR && !fs.existsSync(SETTINGS_FILE)) {
  fs.copyFileSync(BUNDLED_SETTINGS_FILE, SETTINGS_FILE, fs.constants.COPYFILE_EXCL);
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60) || 'file';
      cb(null, `${Date.now()}-${randomBytes(3).toString('hex')}-${base}${ext}`);
    }
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const kind = mediaTypeOf(file.originalname);
    const mimeOk = /^(image|video|audio)\//.test(file.mimetype) || file.mimetype === 'application/ogg';
    if (kind && mimeOk) return cb(null, true);
    cb(new Error('Only picture, video and audio files are supported.'));
  }
});

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
let backendReady = false;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

const store = createStore(db);
const staff = createStaff(store);
const content = createContent(store, staff, getStoredSettings, UPLOAD_DIR);
const pages = registerPages(app, { content, store, root: __dirname, uploadsDir: UPLOAD_DIR,
  getFallbackSettings: () => { try { const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); delete s.passkey; delete s.notifications; return s; } catch { return {}; } } });
content.register(app);
registerMediaPosts(app,{db,staff,sameOrigin,uploadDir:UPLOAD_DIR,mediaTypeOf});

// Only the website itself is public. Never serve api/ (database password), server code,
// package files, docs or migrations.
const PUBLIC_FILES = ['index.html', 'admin.html', 'member-register.html', 'privacy.html', 'terms.html', 'styles.css', 'template.css',
  'script.js', 'site-extras.js', 'agent-tools.js', 'admin.js', 'admin-ux.js', 'admin-dashboard.js',
  'admin-ux.css', 'admin-dashboard.css', 'admin-media-posts.js', 'public-media-posts.js', 'media-posts.css', 'robots.txt'];
for (const f of PUBLIC_FILES) {
  app.get('/' + f, (req, res) => {
    if (f === 'admin.html') { res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive'); }
    res.sendFile(path.join(__dirname, f));
  });
}
// Legacy settings URL must read the same authoritative MySQL row as /api/settings.
app.get('/site-settings.json', async (req, res) => {
  try {
    const {settings, revision} = await getStoredSettings();
    const publicSettings = {...settings};
    delete publicSettings.passkey;
    delete publicSettings.notifications;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Settings-Revision', String(revision));
    res.json(publicSettings);
  } catch (err) {
    console.error('Legacy settings endpoint read failed:', err.code || err.message);
    res.status(503).json({error:'Website settings database unavailable'});
  }
});
// Keep public upload URLs stable when media is stored outside the deployed build.
app.use('/assets/uploads', express.static(UPLOAD_DIR, { index: false, dotfiles: 'ignore', maxAge: '7d', setHeaders: res => res.setHeader('Content-Security-Policy', 'sandbox') }));
app.use('/assets', express.static(path.join(__dirname, 'assets'), { index: false, dotfiles: 'ignore', maxAge: '7d', setHeaders: (res, file) => {
  if (file.startsWith(path.join(__dirname, 'assets', 'uploads') + path.sep)) res.setHeader('Content-Security-Policy', 'sandbox');
} }));
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'privacy.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'terms.html')));
app.get(['/admin/', '/manage/', '/portal/'], (req, res, next) => {
  if (req.path.endsWith('/')) return res.redirect(301, req.path.slice(0, -1));
  next();
});
app.get(['/admin', '/manage', '/portal'], (req, res) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// ---------- shared helpers ----------
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
const getSubmissionTable = (type) => (type === 'prayer' ? 'prayer_requests' : type === 'contact' ? 'connect_requests' : null);

// ---------- database setup (portable: MySQL and MariaDB) ----------
async function addColumnIfMissing(table, column, ddl) {
  const [rows] = await db.execute(
    'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
    [table, column]
  );
  if (rows.length === 0) await db.query(`ALTER TABLE \`${table}\` ADD COLUMN ${column} ${ddl}`);
}

async function ensureTables() {
  // Refuse to mutate an account database belonging to the separate PHP backend.
  const [layout] = await db.execute('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', ['admin_users']);
  if (layout.some(c => c.COLUMN_NAME === 'active') && !layout.some(c => c.COLUMN_NAME === 'is_active')) {
    throw new Error('PHP staff schema detected. Use the PHP backend or an explicitly migrated Node database.');
  }
  await db.query(`CREATE TABLE IF NOT EXISTS prayer_requests (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NULL,
    phone VARCHAR(50) NULL,
    request TEXT NULL,
    is_private TINYINT(1) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'new',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_prayer_status (status),
    INDEX idx_prayer_created (created_at)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS connect_requests (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NULL,
    phone VARCHAR(50) NULL,
    subject VARCHAR(255) NULL,
    message TEXT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'new',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_connect_status (status),
    INDEX idx_connect_created (created_at)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS admin_users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'admin',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    last_login_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
  )`);
  // Repair tables created by older versions.
  for (const t of ['prayer_requests', 'connect_requests']) {
    await addColumnIfMissing(t, 'email', 'VARCHAR(255) NULL');
    await addColumnIfMissing(t, 'phone', 'VARCHAR(50) NULL');
    await addColumnIfMissing(t, 'status', "VARCHAR(20) NOT NULL DEFAULT 'new'");
    await addColumnIfMissing(t, 'created_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
    await addColumnIfMissing(t, 'updated_at', 'TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP');
  }
  await addColumnIfMissing('prayer_requests', 'request', 'TEXT NULL');
  await addColumnIfMissing('prayer_requests', 'is_private', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumnIfMissing('prayer_requests', 'is_read', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumnIfMissing('prayer_requests', 'follow_up', "VARCHAR(12) NOT NULL DEFAULT 'new'");
  await addColumnIfMissing('prayer_requests', 'admin_note', 'VARCHAR(1000) NULL');
  await addColumnIfMissing('connect_requests', 'subject', 'VARCHAR(255) NULL');
  await addColumnIfMissing('connect_requests', 'message', 'TEXT NULL');
  await db.query(`CREATE TABLE IF NOT EXISTS site_settings_store (
    id TINYINT UNSIGNED PRIMARY KEY, settings_json LONGTEXT NOT NULL,
    revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

async function provisionInitialAdmin() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_INITIAL_PASSWORD || '');
  const forceReset = String(process.env.ADMIN_FORCE_RESET || '').toLowerCase() === 'true';
  if (!email || !password) return;
  if (password.length < 10) throw new Error('ADMIN_INITIAL_PASSWORD must be at least 10 characters');

  const [existing] = await db.execute('SELECT id FROM admin_users WHERE email = ? LIMIT 1', [email]);
  const passwordHash = await hashPassword(password);
  if (existing.length > 0) {
    if (!forceReset) return;
    await store.transaction(async connection => {
      await store.query("UPDATE admin_users SET password_hash=?,is_active=1,role='admin' WHERE email=?", [passwordHash,email], connection);
      await store.query('INSERT INTO node_staff_profiles(user_id,role,display_name) VALUES (?,?,?) ON DUPLICATE KEY UPDATE role=VALUES(role)', [String(existing[0].id),'owner',email], connection);
      await store.query('DELETE FROM node_admin_sessions WHERE user_id=?', [String(existing[0].id)], connection);
    });
    console.log(`Admin password reset for ${email}. Remove ADMIN_FORCE_RESET now.`);
    return;
  }
  await db.execute('INSERT IGNORE INTO admin_users (email, password_hash, role) VALUES (?, ?, ?)', [email, passwordHash, 'admin']);
  console.log(`Initial admin account created for ${email}`);
}

const requireSettingsOrigin = sameOrigin;
// Admin-only publishing health check: no credentials or filesystem paths exposed.
app.get('/api/admin/publishing-health', ...staff.permit('settings'), async (req,res) => {
  try {
    const {revision}=await getStoredSettings();
    const [rows]=await db.execute('SELECT updated_at FROM site_settings_store WHERE id=1');
    let mediaTableReady=true;
    try { await db.execute('SELECT id FROM site_media_posts LIMIT 0'); }
    catch { mediaTableReady=false; }
    res.setHeader('Cache-Control','no-store');
    res.json({settingsDatabase:'connected',revision,updatedAt:rows[0]?.updated_at||null,
      mediaDatabase:mediaTableReady?'connected':'migration_required',
      mediaStorage:DATA_DIR?'persistent_directory_configured':'deployment_directory_not_persistent'});
  } catch(err) {
    console.error('Publishing health check:',err.code||err.message);
    res.status(503).json({error:'Settings database unavailable'});
  }
});

// ---------- settings ----------
// Persistent settings: MySQL is authoritative. The bundled JSON is used only to
// initialise an empty staging settings row, never to overwrite an existing row.
async function getStoredSettings() {
  const [rows] = await db.execute('SELECT settings_json, revision FROM site_settings_store WHERE id=1 LIMIT 1');
  if(rows.length)return {settings:JSON.parse(rows[0].settings_json),revision:Number(rows[0].revision)};
  const seed=fs.existsSync(SETTINGS_FILE)?JSON.parse(fs.readFileSync(SETTINGS_FILE,'utf8')):{};
  if(!seed||typeof seed!=='object'||Array.isArray(seed))throw Error('Invalid seed settings');
  delete seed.passkey;
  await db.execute('INSERT IGNORE INTO site_settings_store (id,settings_json,revision) VALUES (1,?,1)',[JSON.stringify(seed)]);
  const [stored]=await db.execute('SELECT settings_json,revision FROM site_settings_store WHERE id=1');
  return {settings:JSON.parse(stored[0].settings_json),revision:Number(stored[0].revision)};
}
app.get('/api/settings',async(req,res)=>{
  try{
    const {settings,revision}=await getStoredSettings();
    const publicSettings={...settings};delete publicSettings.passkey;delete publicSettings.notifications;
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Settings-Revision',String(revision));
    res.json(publicSettings);
  }catch(err){
    console.error('Persistent settings read failed:',err.code||err.message);
    res.status(503).json({error:'Website settings database unavailable; apply migration 003'});
  }
});
app.post('/api/settings',...staff.permit('settings'),requireSettingsOrigin,async(req,res)=>{
  try{
    const next=req.body;
    if(!next||typeof next!=='object'||Array.isArray(next))return res.status(400).json({error:'Settings must be a JSON object'});
    // Only public website settings are accepted, never admin credentials.
    const cleanSettings={...next};delete cleanSettings.passkey;delete cleanSettings.notifications;
    if (!req.staff.permissions.includes('security')) cleanSettings.tracking=(await getStoredSettings()).settings.tracking || {};
    const json=JSON.stringify(cleanSettings);
    if(Buffer.byteLength(json,'utf8')>8*1024*1024)return res.status(413).json({error:'Settings too large'});
    const expected=Number(req.get('If-Match-Settings-Revision'));
    if(!Number.isSafeInteger(expected)||expected<1)return res.status(428).json({error:'Reload settings before saving'});
    const [result]=await db.execute('UPDATE site_settings_store SET settings_json=?,revision=revision+1 WHERE id=1 AND revision=?',[json,expected]);
    if(!result.affectedRows)return res.status(409).json({error:'Settings changed since you opened this page. Reload before saving.'});
    const revision = expected + 1;
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Settings-Revision',String(revision));
    res.json({success:true,settings:cleanSettings,revision});
  }catch(err){
    console.error('Persistent settings write failed:',err.code||err.message);
    res.status(503).json({error:'Settings could not be saved to MySQL; check migration 003'});
  }
});

app.get('/api/runtime', (req, res) => res.json({ backend: 'node', ready: backendReady, mediaStorageDurable: Boolean(DATA_DIR) }));

// Staff cookies are backed by MySQL and roles are rechecked on every request.
app.post('/api/admin/login', sameOrigin, staff.login);
app.post('/api/verify-passkey', sameOrigin, staff.passkey);
app.post('/api/admin/logout', sameOrigin, staff.logout);
app.post('/api/functions/v1/verify-passkey', sameOrigin, staff.passkey);
app.post('/api/functions/v1/admin-users', ...staff.permit(), sameOrigin, staff.team);
app.post('/api/functions/v1/change-passkey', ...staff.permit('security'), sameOrigin, staff.changePasskey);
app.put('/api/auth/v1/user', ...staff.permit(), sameOrigin, staff.changePassword);
app.get('/api/admin/session', ...staff.permit(), route(async (req, res) => res.json({ authenticated: true, user: req.staff, legacy_enabled: Boolean((await store.config()).legacyEnabled) })));
app.get('/api/admin/dashboard', ...staff.permit(), route(async (req, res) => res.json({ dashboard: await content.dashboard(req.staff) })));

app.get('/api/health/db', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT 1 AS connected');
    res.status(backendReady ? 200 : 503).json({ success: backendReady, database: rows[0].connected === 1, backendReady });
  } catch (error) {
    console.error('Database connection failed:', error.message);
    res.status(500).json({ success: false, error: 'Database connection failed' });
  }
});

// ---------- admin: submissions ----------
app.get('/api/admin/submissions', ...staff.permit('care'), async (req, res) => {
  try {
    const requestedType = req.query.type || 'all';
    const search = String(req.query.q || '').trim();
    const status = String(req.query.status || '').trim();
    const types = requestedType === 'all' ? ['prayer', 'contact'] : [requestedType];
    const submissions = [];

    for (const type of types) {
      const table = getSubmissionTable(type);
      if (!table) continue;
      const conditions = [];
      const values = [];
      if (status === 'new' || status === 'handled') { conditions.push('status = ?'); values.push(status); }
      if (search) {
        const like = `%${search.replace(/[%_\\]/g, '\\$&')}%`;
        if (type === 'prayer') { conditions.push('(name LIKE ? OR email LIKE ? OR phone LIKE ? OR request LIKE ?)'); values.push(like, like, like, like); }
        else { conditions.push('(name LIKE ? OR email LIKE ? OR phone LIKE ? OR subject LIKE ? OR message LIKE ?)'); values.push(like, like, like, like, like); }
      }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const [rows] = await db.query(`SELECT * FROM ${table} ${where} ORDER BY created_at DESC LIMIT 500`, values);
      submissions.push(...rows.map((row) => ({ ...row, type })));
    }
    submissions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json({ success: true, submissions });
  } catch (error) {
    console.error('Submission list error:', error.message);
    res.status(500).json({ error: 'Unable to load submissions' });
  }
});

// Defined before the /:type/:id routes so "export" is never read as a type.
const csvCell = (value) => {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
  return `"${s.replace(/"/g, '""')}"`;
};
app.get('/api/admin/submissions/export', ...staff.permit('care'), async (req, res) => {
  try {
    const [prayers] = await db.query('SELECT id, name, email, phone, request, is_private, status, created_at FROM prayer_requests ORDER BY created_at DESC');
    const [contacts] = await db.query('SELECT id, name, email, phone, subject, message, status, created_at FROM connect_requests ORDER BY created_at DESC');
    const rows = [
      ['type', 'id', 'name', 'email', 'phone', 'subject', 'content', 'confidential', 'status', 'created_at'],
      ...prayers.map((r) => ['prayer', r.id, r.name, r.email, r.phone, '', r.request, r.is_private ? 'yes' : 'no', r.status, r.created_at]),
      ...contacts.map((r) => ['contact', r.id, r.name, r.email, r.phone, r.subject, r.message, '', r.status, r.created_at])
    ];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="prayer-army-submissions.csv"');
    res.send('\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n'));
  } catch (error) {
    console.error('Submission export error:', error.message);
    res.status(500).json({ error: 'Unable to export submissions' });
  }
});

app.patch('/api/admin/submissions/:type/:id', ...staff.permit('care'), sameOrigin, async (req, res) => {
  try {
    const table = getSubmissionTable(req.params.type);
    const id = String(req.params.id);
    const status = req.body?.status;
    if (!table || !/^[1-9][0-9]{0,19}$/.test(id) || !['new', 'handled'].includes(status)) return res.status(400).json({ error: 'Invalid submission update' });
    const [result] = await db.execute(`UPDATE ${table} SET status = ? WHERE id = ?`, [status, id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Submission not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('Submission update error:', error.message);
    res.status(500).json({ error: 'Unable to update submission' });
  }
});

app.delete('/api/admin/submissions/:type/:id', ...staff.permit('care'), sameOrigin, async (req, res) => {
  try {
    const table = getSubmissionTable(req.params.type);
    const id = String(req.params.id);
    if (!table || !/^[1-9][0-9]{0,19}$/.test(id)) return res.status(400).json({ error: 'Invalid submission target' });
    const [result] = await db.execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Submission not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('Submission deletion error:', error.message);
    res.status(500).json({ error: 'Unable to delete submission' });
  }
});

// ---------- admin: media ----------
app.post('/api/upload', ...staff.permit('media'), requireSettingsOrigin, (req, res) => {
  if (process.env.NODE_ENV === 'production' && !DATA_DIR) return res.status(503).json({ error: 'Configure PAI_DATA_DIR to a persistent directory before uploading production media' });
  upload.array('files', 10)(req, res, async (err) => {
    if (err) return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'A file is larger than 100 MB' : err.message });
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files were uploaded' });
    try {
      const allowed = {
        '.jpg':['image/jpeg'],'.jpeg':['image/jpeg'],'.png':['image/png'],'.gif':['image/gif'],'.webp':['image/webp'],'.avif':['image/avif'],
        '.mp4':['video/mp4'],'.m4v':['video/mp4','video/x-m4v'],'.mov':['video/quicktime'],'.webm':['video/webm','audio/webm'],'.ogv':['video/ogg','application/ogg'],
        '.mp3':['audio/mpeg'],'.m4a':['audio/mp4','video/mp4','audio/x-m4a'],'.wav':['audio/wav','audio/x-wav'],'.ogg':['audio/ogg','video/ogg','application/ogg'],'.oga':['audio/ogg','application/ogg'],'.aac':['audio/aac'],'.flac':['audio/flac','audio/x-flac']
      };
      for (const file of req.files) {
        const detected = await fileTypeFromFile(file.path);
        if (!detected || !allowed[path.extname(file.filename).toLowerCase()]?.includes(detected.mime)) throw Error('The file contents do not match a supported media format');
        file.detectedMime = detected.mime;
      }
    } catch {
      await Promise.all(req.files.map(file => fs.promises.unlink(file.path).catch(() => {})));
      return res.status(415).json({ error: 'A file does not contain the picture, video or audio format indicated by its extension' });
    }
    res.json({
      success: true,
      files: req.files.map((f) => ({
        filename: f.filename, originalName: f.originalname, url: `assets/uploads/${f.filename}`,
        mimetype: f.detectedMime, type: mediaTypeOf(f.filename), size: f.size, uploadedAt: new Date().toISOString()
      }))
    });
  });
});

app.get('/api/media', ...staff.permit('media'), (req, res) => {
  try {
    const list = [];
    const scan = (dir, urlBase, isUpload) => {
      if (!fs.existsSync(dir)) return;
      for (const name of fs.readdirSync(dir)) {
        if (name.startsWith('.')) continue;
        const type = mediaTypeOf(name);
        if (!type) continue;
        try {
          const st = fs.statSync(path.join(dir, name));
          if (st.isFile()) list.push({ filename: name, url: `${urlBase}/${name}`, type, size: st.size, mtime: st.mtimeMs, isUpload });
        } catch { /* skip unreadable file */ }
      }
    };
    scan(UPLOAD_DIR, 'assets/uploads', true);
    scan(IMAGES_DIR, 'assets/images', false);
    list.sort((a, b) => b.mtime - a.mtime);
    res.json({ success: true, media: list });
  } catch { res.status(500).json({ error: 'Failed to retrieve media files' }); }
});

app.delete('/api/media/:filename', ...staff.permit('media'), requireSettingsOrigin, (req, res) => {
  try {
    const filename = req.params.filename;
    if (!filename || filename !== path.basename(filename) || filename.startsWith('.')) return res.status(400).json({error:'Invalid filename'});
    const target = path.join(UPLOAD_DIR, filename);
    if (!fs.existsSync(target)) return res.status(404).json({ error: 'File not found in uploads' });
    fs.unlinkSync(target);
    res.json({ success: true, message: 'File deleted' });
  } catch { res.status(500).json({ error: 'Failed to delete file' }); }
});

const requireMembershipOrigin = sameOrigin;
app.post('/api/storage/v1/object/list/media', ...staff.permit('media'), sameOrigin, route(async (req, res) => {
  const names = fs.readdirSync(UPLOAD_DIR).filter(name => !name.startsWith('.') && mediaTypeOf(name));
  res.json(names.map(name => { const st = fs.statSync(path.join(UPLOAD_DIR, name)); return { name, created_at: st.mtime.toISOString(), metadata: { size: st.size } }; }));
}));

// Membership approval policy: protected by the existing staff admin session.
app.get('/api/admin/membership/configuration', ...staff.permit('team'), async(req,res)=>{
  try {
    const [rows]=await db.execute('SELECT approval_mode,require_email_verification FROM membership_configuration WHERE id=1');
    if(!rows.length)return res.status(503).json({error:'Apply migration 002 first'});
    res.setHeader('Cache-Control','no-store');
    res.json({approvalMode:rows[0].approval_mode,requireEmailVerification:Boolean(rows[0].require_email_verification)});
  } catch(err){console.error('Membership configuration read:',err.code||err.message);res.status(503).json({error:'Membership configuration unavailable'});}
});
app.put('/api/admin/membership/configuration', ...staff.permit('team'), requireMembershipOrigin, async(req,res)=>{
  const mode=req.body?.approvalMode, verify=req.body?.requireEmailVerification;
  if(!['manual','automatic'].includes(mode) || typeof verify!=='boolean')return res.status(400).json({error:'Invalid membership settings'});
  if(mode==='automatic' && !verify)return res.status(400).json({error:'Automatic approval requires email verification'});
  try {
    await db.execute('UPDATE membership_configuration SET approval_mode=?,require_email_verification=? WHERE id=1',[mode,verify?1:0]);
    res.json({success:true,approvalMode:mode,requireEmailVerification:verify});
  } catch(err){console.error('Membership configuration save:',err.code||err.message);res.status(503).json({error:'Membership configuration unavailable'});}
});

// Staff-only pending member review. No password hashes or auth tokens are returned.
app.get('/api/admin/membership/applications',...staff.permit('team'),async(req,res)=>{
  try {
    const [rows]=await db.execute("SELECT a.id,a.display_name,a.email,a.status,a.email_verified_at,a.created_at FROM public_accounts a INNER JOIN public_account_roles r ON r.account_id=a.id AND r.role='member' WHERE a.status='pending' ORDER BY a.created_at ASC LIMIT 200");
    res.setHeader('Cache-Control','no-store');
    res.json({applications:rows.map(r=>({...r,id:String(r.id)}))});
  }catch(err){console.error('Membership applications read:',err.code||err.message);res.status(503).json({error:'Applications unavailable'});}
});
app.post('/api/admin/membership/applications/:id/decision',...staff.permit('team'),requireMembershipOrigin,async(req,res)=>{
  const id=req.params.id,decision=req.body?.decision;
  if(!/^[1-9][0-9]{0,19}$/.test(id)||!['approve','reject'].includes(decision))return res.status(400).json({error:'Invalid decision'});
  const connection=await db.getConnection();
  try {
    await connection.beginTransaction();
    const [config]=await connection.execute('SELECT require_email_verification FROM membership_configuration WHERE id=1');
    const [rows]=await connection.execute("SELECT a.id,a.email_verified_at FROM public_accounts a INNER JOIN public_account_roles r ON r.account_id=a.id AND r.role='member' WHERE a.id=? AND a.status='pending' FOR UPDATE",[id]);
    if(!rows.length){await connection.rollback();return res.status(404).json({error:'Pending member not found'});}
    if(!config.length){await connection.rollback();return res.status(503).json({error:'Membership settings unavailable'});}
    if(decision==='approve' && config[0].require_email_verification && !rows[0].email_verified_at){
      await connection.rollback();return res.status(409).json({error:'Email verification required before approval'});
    }
    await connection.execute('UPDATE public_accounts SET status=? WHERE id=?',[decision==='approve'?'active':'closed',id]);
    await connection.execute('INSERT INTO public_audit_events (action,subject_type,subject_id,metadata_json) VALUES (?,?,?,?)',
      ['membership.'+decision,'public_account',id,JSON.stringify({via:'staff_admin_portal'})]);
    await connection.commit();
    res.json({success:true,decision});
  }catch(err){await connection.rollback();console.error('Membership decision:',err.code||err.message);res.status(503).json({error:'Unable to update application'});}
  finally{connection.release();}
});

// Public account routes remain opt-in; their schema is initialized when enabled.
app.use('/api/public', createPublicAccountRouter(db));

// ---------- fallbacks (must stay last) ----------
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.get('/{*splat}', (req, res) => {
  // Missing files, dotfiles and unknown pages retain a real HTTP 404.
  if (path.extname(req.path) || /(^|\/)\./.test(req.path)) return res.status(404).type('text/plain').send('Not found');
  if (req.path === '/') return res.sendFile(path.join(__dirname, 'index.html'));
  return pages.notFound(req, res, () => {});
});

// Express error handler: never leak stack traces, never hang on bad JSON.
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  if (req.path === '/mcp' && status === 400) return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  res.status(status >= 400 && status < 600 ? status : 500).json({ error: status === 413 ? 'Request too large' : status === 400 ? 'Bad request' : 'Server error' });
});

async function startServer() {
  // The website must come up even if the database is down or misconfigured.
  try {
    await ensureTables();
    const legacySeed = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    const legacy = String(process.env.ADMIN_PASSKEY || legacySeed.passkey || '');
    await store.initialize({ ...(legacy ? { legacyEnabled: true, passkeyHash: await hashPassword(legacy) } : {}), ...(legacySeed.notifications && typeof legacySeed.notifications === 'object' ? { notifications: legacySeed.notifications } : {}) });
    await provisionInitialAdmin();
    if (process.env.PAI_PUBLIC_ACCOUNTS_ENABLED === 'true') {
      for (const file of ['001_public_identity.sql', '002_membership_configuration.sql']) {
        const sql = fs.readFileSync(path.join(__dirname, 'migrations', file), 'utf8');
        for (const statement of sql.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean)) await db.query(statement);
      }
    }
    await getStoredSettings();
    backendReady = true;
    console.log('Database tables and admin setup are ready');
  } catch (error) {
    console.error('Database not ready (the site is still served, forms will report an error):', error.message);
  }
  app.listen(PORT, HOST, () => console.log(`Server running at http://${HOST}:${PORT}`));
}

startServer();
