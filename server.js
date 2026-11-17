// Prayer Army International - optional Node.js host.
//
// What this server does: serves the public website files, accepts the two public
// forms (prayer request, connect) into MySQL/MariaDB, and offers a small cookie-protected
// admin API (settings, submissions, media).
//
// What it does NOT do: the website's admin panel, sermons archive, comments, testimonies,
// prayer wall, podcast feed and team accounts are provided by the PHP API in /api
// (see HOSTINGER-DEPLOY.md). On a Node-only host those features need that API too.
//
// Environment variables: PORT, DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME,
// ADMIN_EMAIL + ADMIN_INITIAL_PASSWORD (first admin), ADMIN_FORCE_RESET=true (one-off reset),
// ADMIN_PASSKEY (optional shared passkey; there is no default).

import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { randomUUID, randomBytes, createHash, createHmac, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import multer from 'multer';
import db from './database.js';
import { createPublicAccountRouter } from './public-auth.js';

const scrypt = promisify(scryptCallback);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// PAI_DATA_DIR is an optional, operator-managed directory OUTSIDE Hostinger's versioned builds.
// When unset, retain legacy paths for backward compatibility; do not silently migrate data.
const DATA_DIR = process.env.PAI_DATA_DIR ? path.resolve(process.env.PAI_DATA_DIR) : null;
const BUNDLED_SETTINGS_FILE = path.join(__dirname, 'site-settings.json');
const SETTINGS_FILE = DATA_DIR ? path.join(DATA_DIR, 'site-settings.json') : BUNDLED_SETTINGS_FILE;
const UPLOAD_DIR = DATA_DIR ? path.join(DATA_DIR, 'uploads') : path.join(__dirname, 'assets', 'uploads');
const IMAGES_DIR = path.join(__dirname, 'assets', 'images');
const SESSION_MS = 8 * 60 * 60 * 1000;
const ADMIN_SESSIONS = new Map(); // token -> { expires, user }

const MEDIA_EXT = {
  image: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'],
  video: ['.mp4', '.webm', '.mov', '.m4v', '.ogv'],
  audio: ['.mp3', '.m4a', '.wav', '.ogg', '.oga', '.aac']
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

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Only the website itself is public. Never serve api/ (database password), server code,
// package files, docs or migrations.
const PUBLIC_FILES = ['index.html', 'admin.html', 'member-register.html', 'privacy.html', 'terms.html', 'styles.css', 'template.css',
  'script.js', 'site-extras.js', 'agent-tools.js', 'admin.js', 'admin-ux.js', 'admin-dashboard.js',
  'admin-ux.css', 'admin-dashboard.css', 'robots.txt'];
for (const f of PUBLIC_FILES) {
  app.get('/' + f, (req, res) => {
    if (f === 'admin.html') { res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive'); }
    res.sendFile(path.join(__dirname, f));
  });
}
app.get('/site-settings.json', (req, res) => { // never expose a legacy passkey stored in the file
  try {
    const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    delete data.passkey;
    delete data.notifications; // internal notification settings are not public
    res.setHeader('Cache-Control', 'no-store');
    res.json(data);
  } catch { res.json({}); }
});
// Keep public upload URLs stable when media is stored outside the deployed build.
if (DATA_DIR) app.use('/assets/uploads', express.static(UPLOAD_DIR, { index: false, dotfiles: 'ignore', maxAge: '7d' }));
app.use('/assets', express.static(path.join(__dirname, 'assets'), { index: false, dotfiles: 'ignore', maxAge: '7d' }));
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

// ---------- small helpers ----------
function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore bad cookie */ }
  }
  return out;
}

const hits = new Map(); // key -> [timestamps]
function limited(key, max, windowMs) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  return list.length > max;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some((t) => now - t < 3600000)) hits.delete(k); for (const [t, session] of ADMIN_SESSIONS) if (session.expires < now) ADMIN_SESSIONS.delete(t); }, 600000).unref();

function requireAdmin(req, res, next) {
  const token = parseCookies(req).admin_session;
  const session = token && ADMIN_SESSIONS.get(token);
  if (!session || session.expires < Date.now()) {
    if (token) ADMIN_SESSIONS.delete(token);
    return res.status(401).json({ error: 'Admin authentication required' });
  }
  res.setHeader('Cache-Control', 'no-store');
  req.adminUser = session.user;
  next();
}

function setAdminSession(req, res, user) {
  const token = randomUUID();
  ADMIN_SESSIONS.set(token, { expires: Date.now() + SESSION_MS, user });
  const secure = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `admin_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MS / 1000}${secure}`);
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `${salt}:${Buffer.from(key).toString('hex')}`;
}
async function verifyPassword(password, stored) {
  const [salt, keyHex] = String(stored || '').split(':');
  if (!salt || !keyHex) return false;
  const key = await scrypt(password, salt, 64);
  const want = Buffer.from(keyHex, 'hex');
  return want.length === key.length && timingSafeEqual(want, key);
}
const sha = (s) => createHash('sha256').update(String(s)).digest();
const safeEqual = (a, b) => timingSafeEqual(sha(a), sha(b));

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
    await db.execute(`UPDATE admin_users SET password_hash = ?, is_active = 1, role = 'admin' WHERE email = ?`, [passwordHash, email]);
    console.log(`Admin password reset for ${email}. Remove ADMIN_FORCE_RESET now.`);
    return;
  }
  await db.execute('INSERT INTO admin_users (email, password_hash, role) VALUES (?, ?, ?)', [email, passwordHash, 'admin']);
  console.log(`Initial admin account created for ${email}`);
}

// Reject cross-origin state-changing settings requests (including missing Origin).
function requireSettingsOrigin(req,res,next){
  const origin=req.get('origin');
  if(!origin)return res.status(403).json({error:'Origin required'});
  try{
    const parsed=new URL(origin);
    if(!['http:', 'https:'].includes(parsed.protocol) || parsed.host!==req.get('host') || (req.secure && parsed.protocol!=='https:'))
      return res.status(403).json({error:'Origin mismatch'});
  }catch{return res.status(403).json({error:'Invalid origin'});}
  next();
}
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
app.post('/api/settings',requireAdmin,requireSettingsOrigin,async(req,res)=>{
  try{
    const next=req.body;
    if(!next||typeof next!=='object'||Array.isArray(next))return res.status(400).json({error:'Settings must be a JSON object'});
    // Only public website settings are accepted, never admin credentials.
    const cleanSettings={...next};delete cleanSettings.passkey;delete cleanSettings.notifications;
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

app.get('/api/runtime', (req, res) => res.json({ backend: 'node' }));

// ---------- admin sign-in ----------
app.post('/api/verify-passkey', requireSettingsOrigin, (req, res) => {
  try {
    if (limited('pk:' + req.ip, 10, 15 * 60 * 1000)) return res.status(429).json({ success: false, error: 'Too many attempts. Please wait a few minutes.' });
    let valid = String(process.env.ADMIN_PASSKEY || '');
    if (!valid && fs.existsSync(SETTINGS_FILE)) valid = String(JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')).passkey || '');
    if (!valid) return res.status(401).json({ success: false, error: 'Passkey sign-in is turned off. Use your account.' });
    if (!safeEqual(req.body?.passkey ?? '', valid)) return res.status(401).json({ success: false, error: 'Incorrect passkey' });
    setAdminSession(req, res, { email: 'Shared passkey', role: 'admin' });
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Verification failed' }); }
});

app.post('/api/admin/login', requireSettingsOrigin, async (req, res) => {
  try {
    if (limited('login:' + req.ip, 10, 15 * 60 * 1000)) return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes.' });
    const email = clean(req.body?.email, 255).toLowerCase();
    const password = String(req.body?.password ?? '');
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const [rows] = await db.execute('SELECT id, email, password_hash, role FROM admin_users WHERE email = ? AND is_active = 1 LIMIT 1', [email]);
    const ok = rows.length > 0 && (await verifyPassword(password, rows[0].password_hash));
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    await db.execute('UPDATE admin_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [rows[0].id]);
    setAdminSession(req, res, { email: rows[0].email, role: rows[0].role });
    res.json({ success: true, user: { email: rows[0].email, role: rows[0].role } });
  } catch (error) {
    console.error('Admin login error:', error.message);
    res.status(500).json({ error: 'Unable to sign in' });
  }
});

// Read-only overview of actual staging records. Missing optional tables are omitted.
app.get('/api/admin/dashboard',requireAdmin,async(req,res)=>{
  const counts={};
  for(const [key,table] of Object.entries({prayer_requests:'prayer_requests',visitor_enquiries:'connect_requests',member_applications:'public_accounts'})){
    try {
      const sql=key==='member_applications'?"SELECT COUNT(*) AS total FROM public_accounts WHERE status='pending'":"SELECT COUNT(*) AS total FROM "+table;
      const [rows]=await db.query(sql);
      counts[key]=Number(rows[0].total);
    }catch(err){console.warn('Dashboard count unavailable:',key,err.code||err.message);}
  }
  const activity=[];
  try{
    const [events]=await db.query("SELECT action, created_at FROM public_audit_events ORDER BY created_at DESC LIMIT 6");
    for(const event of events)activity.push({action:String(event.action||'Account activity'),at:event.created_at});
  }catch(err){console.warn('Dashboard activity unavailable:',err.code||err.message);}
  res.setHeader('Cache-Control','no-store');
  res.json({counts,activity});
});

app.get('/api/admin/session',requireAdmin,async(req,res)=>{
  try {
    // Existing admin session is server-validated; no secrets returned.
    res.setHeader('Cache-Control','no-store');
    res.json({authenticated:true,user:req.adminUser});
  }catch{res.status(503).json({error:'Session unavailable'});}
});

app.post('/api/admin/logout', requireSettingsOrigin, (req, res) => {
  const t = parseCookies(req).admin_session;
  if (t) ADMIN_SESSIONS.delete(t);
  res.setHeader('Set-Cookie', 'admin_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ success: true });
});

app.get('/api/health/db', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT 1 AS connected');
    res.json({ success: true, database: rows[0].connected === 1 });
  } catch (error) {
    console.error('Database connection failed:', error.message);
    res.status(500).json({ success: false, error: 'Database connection failed' });
  }
});

// ---------- read-only public content (existing production tables) ----------
// Explicit column allowlists prevent private fields and unapproved submissions leaking.
// Query parameters only affect a bounded limit and sort direction.
app.get('/api/rest/v1/:resource', async (req, res, next) => {
  const resource = req.params.resource;
  const definitions = {
    messages: {
      table: 'site_content_messages',
      fields: 'id, title, description, link, media_url, media_type, notes_url, created_at',
      where: ''
    },
    testimonies: {
      table: 'site_content_testimonies',
      fields: 'id, name, location, testimony, created_at',
      where: 'WHERE is_approved = 1'
    },
    wall_prayers: {
      table: 'site_content_wall_prayers',
      fields: 'id, name, request, prayed_count',
      where: 'WHERE is_approved = 1'
    }
  };
  const def = definitions[resource];
  if (!def) return next();
  const max = resource === 'messages' ? 200 : resource === 'testimonies' ? 50 : 100;
  const requested = Number.parseInt(String(req.query.limit ?? max), 10);
  const limit = Number.isFinite(requested) ? Math.min(max, Math.max(1, requested)) : max;
  const order = String(req.query.order || '').endsWith('.asc') ? 'ASC' : 'DESC';
  try {
    let fields = def.fields;
    if (resource === 'testimonies') {
      const [columns] = await db.execute('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [def.table, 'show_name']);
      fields = fields.replace('id, name,', columns.length ? "id, IF(show_name = 1, name, 'Anonymous') AS name," : "id, 'Anonymous' AS name,");
    }
    const [rows] = await db.query(
      `SELECT ${fields} FROM \`${def.table}\` ${def.where} ORDER BY created_at ${order} LIMIT ${limit}`
    );
    res.setHeader('Cache-Control', 'public, max-age=30');
    res.json(rows);
  } catch (error) {
    console.error('Public content read failed:', resource, error.message);
    res.status(503).json({ error: 'Content temporarily unavailable' });
  }
});

// Signed form tokens match the age rules used by the PHP host.
const formSecret = randomBytes(32);
const signFormTime = ts => createHmac('sha256', formSecret).update(`form|${ts}`).digest('hex').slice(0, 32);
app.get('/api/form-token', (req, res) => {
  const ts = String(Math.floor(Date.now() / 1000));
  res.setHeader('Cache-Control', 'no-store');
  res.json({ token: `${ts}.${signFormTime(ts)}` });
});
function publicFormGuard(req, res, next) {
  if (req.body?.website) return res.sendStatus(201);
  const token = req.body?._ft;
  const match = typeof token === 'string' && token.match(/^(\d{9,11})\.([a-f0-9]{32})$/);
  const age = match ? Math.floor(Date.now() / 1000) - Number(match[1]) : -1;
  if (!match || age < 2 || age > 14400 || !safeEqual(match[2], signFormTime(match[1]))) {
    return res.status(400).json({ error: 'Please refresh the page and try again.' });
  }
  next();
}

// ---------- public forms (same field names the website sends) ----------
app.post('/api/rest/v1/prayer_requests', publicFormGuard, async (req, res) => {
  try {
    if (limited('prayer:' + req.ip, 20, 3600 * 1000)) return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    const b = req.body || {};
    const name = clean(b.name, 150);
    const request = clean(b.request ?? b.message ?? b.prayer_request, 4000);
    // The website sends one "contact" box (phone or email); older callers send email/phone.
    const contact = clean(b.contact, 255);
    const email = clean(b.email, 255) || (contact.includes('@') ? contact : '');
    const phone = clean(b.phone, 50) || (contact && !contact.includes('@') ? contact.slice(0, 50) : '');
    const isPrivate = b.is_private === true || b.is_private === 'true' || b.is_private === 1 || b.private === 'on' ? 1 : 0;
    if (!name || !request) return res.status(400).json({ error: 'Name and prayer request are required' });

    const [result] = await db.execute(
      'INSERT INTO prayer_requests (name, email, phone, request, is_private) VALUES (?, ?, ?, ?, ?)',
      [name, email || null, phone || null, request, isPrivate]
    );
    res.status(201).json({ success: true, id: result.insertId });
  } catch (error) {
    console.error('Prayer request error:', error.message);
    res.status(500).json({ error: 'Unable to save prayer request' });
  }
});

app.post('/api/rest/v1/connect_requests', publicFormGuard, async (req, res) => {
  try {
    if (limited('connect:' + req.ip, 20, 3600 * 1000)) return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    const b = req.body || {};
    const name = clean(b.name, 150);
    const email = clean(b.email, 255);
    const phone = clean(b.phone, 50);
    const subject = clean(b.subject ?? b.kind, 255); // the website sends "kind" (visitor, volunteer, ...)
    const message = clean(b.message ?? b.note, 4000);
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!email && !phone) return res.status(400).json({ error: 'Please add a phone number or an email so we can reach you.' });

    const [result] = await db.execute(
      'INSERT INTO connect_requests (name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?)',
      [name, email || null, phone || null, subject || null, message || null]
    );
    res.status(201).json({ success: true, id: result.insertId });
  } catch (error) {
    console.error('Contact message error:', error.message);
    res.status(500).json({ error: 'Unable to save contact message' });
  }
});

// Compatibility for the existing dashboard's prayer and visitor management controls.
// The PHP host uses the same action names, but stores different row shapes.
app.post('/api/functions/v1/manage-content', requireAdmin, requireSettingsOrigin, async (req, res) => {
  const action = req.body?.action;
  const payload = req.body?.payload || {};
  const id = String(payload.id || '');
  try {
    if (action === 'list_prayer_requests' || action === 'list_connect_requests') {
      const prayer = action === 'list_prayer_requests';
      const table = prayer ? 'prayer_requests' : 'connect_requests';
      const [rows] = await db.query(`SELECT * FROM ${table} ORDER BY created_at DESC LIMIT 500`);
      return res.json({ requests: rows.map(row => prayer ? {
        id: String(row.id), name: row.name, contact: [row.email, row.phone].filter(Boolean).join(' / '),
        request: row.request, is_private: Boolean(row.is_private), is_read: Boolean(row.is_read),
        follow_up: row.follow_up, admin_note: row.admin_note, created_at: row.created_at
      } : {
        id: String(row.id), name: row.name, email: row.email, phone: row.phone,
        kind: row.subject, note: row.message, is_contacted: row.status === 'handled', created_at: row.created_at
      }) });
    }
    const definitions = {
      mark_prayer_request_read: ['prayer_requests', 'UPDATE prayer_requests SET is_read = ? WHERE id = ?', [payload.is_read !== false ? 1 : 0, id]],
      set_prayer_followup: ['prayer_requests', 'UPDATE prayer_requests SET follow_up = ?, admin_note = ?, is_read = 1 WHERE id = ?',
        [['new', 'in_progress', 'done'].includes(payload.follow_up) ? payload.follow_up : 'new', clean(payload.admin_note, 1000) || null, id]],
      delete_prayer_request: ['prayer_requests', 'DELETE FROM prayer_requests WHERE id = ?', [id]],
      mark_connect_contacted: ['connect_requests', 'UPDATE connect_requests SET status = ? WHERE id = ?', [payload.is_contacted !== false ? 'handled' : 'new', id]],
      delete_connect_request: ['connect_requests', 'DELETE FROM connect_requests WHERE id = ?', [id]]
    };
    const def = definitions[action];
    if (!def) return res.status(501).json({ error: 'This content module requires the PHP backend; it is not connected on this Node host.' });
    if (!/^[1-9][0-9]{0,18}$/.test(id)) return res.status(400).json({ error: 'Invalid request ID' });
    await db.execute(def[1], def[2]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Submission action failed:', err.code || err.message);
    res.status(503).json({ error: 'Unable to manage submissions' });
  }
});

// ---------- admin: submissions ----------
app.get('/api/admin/submissions', requireAdmin, async (req, res) => {
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
app.get('/api/admin/submissions/export', requireAdmin, async (req, res) => {
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

app.patch('/api/admin/submissions/:type/:id', requireAdmin, async (req, res) => {
  try {
    const table = getSubmissionTable(req.params.type);
    const id = Number(req.params.id);
    const status = req.body?.status;
    if (!table || !Number.isInteger(id) || !['new', 'handled'].includes(status)) return res.status(400).json({ error: 'Invalid submission update' });
    const [result] = await db.execute(`UPDATE ${table} SET status = ? WHERE id = ?`, [status, id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Submission not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('Submission update error:', error.message);
    res.status(500).json({ error: 'Unable to update submission' });
  }
});

app.delete('/api/admin/submissions/:type/:id', requireAdmin, async (req, res) => {
  try {
    const table = getSubmissionTable(req.params.type);
    const id = Number(req.params.id);
    if (!table || !Number.isInteger(id)) return res.status(400).json({ error: 'Invalid submission target' });
    const [result] = await db.execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Submission not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('Submission deletion error:', error.message);
    res.status(500).json({ error: 'Unable to delete submission' });
  }
});

// ---------- admin: media ----------
app.post('/api/upload', requireAdmin, requireSettingsOrigin, (req, res) => {
  upload.array('files', 10)(req, res, (err) => {
    if (err) return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'A file is larger than 100 MB' : err.message });
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files were uploaded' });
    res.json({
      success: true,
      files: req.files.map((f) => ({
        filename: f.filename, originalName: f.originalname, url: `assets/uploads/${f.filename}`,
        mimetype: f.mimetype, type: mediaTypeOf(f.filename), size: f.size, uploadedAt: new Date().toISOString()
      }))
    });
  });
});

app.get('/api/media', requireAdmin, (req, res) => {
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

app.delete('/api/media/:filename', requireAdmin, requireSettingsOrigin, (req, res) => {
  try {
    const filename = req.params.filename;
    if (!filename || filename !== path.basename(filename) || filename.startsWith('.')) return res.status(400).json({error:'Invalid filename'});
    const target = path.join(UPLOAD_DIR, filename);
    if (!fs.existsSync(target)) return res.status(404).json({ error: 'File not found in uploads' });
    fs.unlinkSync(target);
    res.json({ success: true, message: 'File deleted' });
  } catch { res.status(500).json({ error: 'Failed to delete file' }); }
});

// Sensitive membership actions require a same-origin browser request.
function requireMembershipOrigin(req,res,next){
  const origin=req.get('origin'),host=req.get('host');
  if(!origin||!host)return res.status(403).json({error:'Origin required'});
  try {
    const parsed=new URL(origin);
    if(!['http:', 'https:'].includes(parsed.protocol) || parsed.host!==host || (req.secure && parsed.protocol!=='https:'))return res.status(403).json({error:'Origin mismatch'});
  }catch{return res.status(403).json({error:'Invalid origin'});}
  next();
}
// Membership approval policy: protected by the existing staff admin session.
app.get('/api/admin/membership/configuration', requireAdmin, async(req,res)=>{
  try {
    const [rows]=await db.execute('SELECT approval_mode,require_email_verification FROM membership_configuration WHERE id=1');
    if(!rows.length)return res.status(503).json({error:'Apply migration 002 first'});
    res.setHeader('Cache-Control','no-store');
    res.json({approvalMode:rows[0].approval_mode,requireEmailVerification:Boolean(rows[0].require_email_verification)});
  } catch(err){console.error('Membership configuration read:',err.code||err.message);res.status(503).json({error:'Membership configuration unavailable'});}
});
app.put('/api/admin/membership/configuration', requireAdmin, requireMembershipOrigin, async(req,res)=>{
  const mode=req.body?.approvalMode, verify=req.body?.requireEmailVerification;
  if(!['manual','automatic'].includes(mode) || typeof verify!=='boolean')return res.status(400).json({error:'Invalid membership settings'});
  if(mode==='automatic' && !verify)return res.status(400).json({error:'Automatic approval requires email verification'});
  try {
    await db.execute('UPDATE membership_configuration SET approval_mode=?,require_email_verification=? WHERE id=1',[mode,verify?1:0]);
    res.json({success:true,approvalMode:mode,requireEmailVerification:verify});
  } catch(err){console.error('Membership configuration save:',err.code||err.message);res.status(503).json({error:'Membership configuration unavailable'});}
});

// Staff-only pending member review. No password hashes or auth tokens are returned.
app.get('/api/admin/membership/applications',requireAdmin,async(req,res)=>{
  try {
    const [rows]=await db.execute("SELECT a.id,a.display_name,a.email,a.status,a.email_verified_at,a.created_at FROM public_accounts a INNER JOIN public_account_roles r ON r.account_id=a.id AND r.role='member' WHERE a.status='pending' ORDER BY a.created_at ASC LIMIT 200");
    res.setHeader('Cache-Control','no-store');
    res.json({applications:rows.map(r=>({...r,id:String(r.id)}))});
  }catch(err){console.error('Membership applications read:',err.code||err.message);res.status(503).json({error:'Applications unavailable'});}
});
app.post('/api/admin/membership/applications/:id/decision',requireAdmin,requireMembershipOrigin,async(req,res)=>{
  const id=req.params.id,decision=req.body?.decision;
  if(!/^[1-9][0-9]{0,18}$/.test(id)||!['approve','reject'].includes(decision))return res.status(400).json({error:'Invalid decision'});
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

// Public account routes are feature-flagged; no schema changes run automatically.
app.use('/api/public', createPublicAccountRouter(db));

// ---------- fallbacks (must stay last) ----------
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.get('/{*splat}', (req, res) => {
  // Missing files and dotfiles are a real 404; page-like URLs get the homepage.
  if (path.extname(req.path) || /(^|\/)\./.test(req.path)) return res.status(404).type('text/plain').send('Not found');
  if (req.path === '/') return res.sendFile(path.join(__dirname, 'index.html'));
  res.status(404).type('text/plain').send('Page not found');
});

// Express error handler: never leak stack traces, never hang on bad JSON.
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  res.status(status >= 400 && status < 600 ? status : 500).json({ error: status === 413 ? 'Request too large' : status === 400 ? 'Bad request' : 'Server error' });
});

async function startServer() {
  // The website must come up even if the database is down or misconfigured.
  try {
    await ensureTables();
    await provisionInitialAdmin();
    console.log('Database tables and admin setup are ready');
  } catch (error) {
    console.error('Database not ready (the site is still served, forms will report an error):', error.message);
  }
  app.listen(PORT, HOST, () => console.log(`Server running at http://${HOST}:${PORT}`));
}

startServer();
