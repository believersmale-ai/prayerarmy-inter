import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { randomUUID, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCallback);
import multer from 'multer';
import db from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SETTINGS_FILE = path.join(__dirname, 'site-settings.json');
const UPLOAD_DIR = path.join(__dirname, 'assets', 'uploads');
const IMAGES_DIR = path.join(__dirname, 'assets', 'images');
const ADMIN_SESSIONS = new Map();

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E6);
    cb(null, `${uniqueSuffix}-${cleanName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are supported.'));
    }
  }
});

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(
    header.split(';').filter(Boolean).map(part => {
      const index = part.indexOf('=');
      const key = index >= 0 ? part.slice(0, index).trim() : part.trim();
      const value = index >= 0 ? decodeURIComponent(part.slice(index + 1).trim()) : '';
      return [key, value];
    })
  );
}

function requireAdmin(req, res, next) {
  const session = parseCookies(req).admin_session;
  if (!session || !ADMIN_SESSIONS.has(session)) {
    return res.status(401).json({ error: 'Admin authentication required' });
  }
  next();
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = await scrypt(password, salt, 64);
  return `${salt}:${Buffer.from(derivedKey).toString('hex')}`;
}

async function verifyPassword(password, storedHash) {
  const [salt, keyHex] = String(storedHash || '').split(':');
  if (!salt || !keyHex) return false;
  const derivedKey = await scrypt(password, salt, 64);
  const storedKey = Buffer.from(keyHex, 'hex');
  return storedKey.length === derivedKey.length && timingSafeEqual(storedKey, derivedKey);
}

function setAdminSession(res) {
  const token = randomUUID();
  ADMIN_SESSIONS.set(token, Date.now() + 8 * 60 * 60 * 1000);
  res.setHeader(
    'Set-Cookie',
    `admin_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`
  );
}

function getSubmissionTable(type) {
  if (type === 'prayer') return 'prayer_requests';
  if (type === 'contact') return 'connect_requests';
  return null;
}

async function ensureTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS prayer_requests (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      email VARCHAR(255) NULL,
      phone VARCHAR(50) NULL,
      request TEXT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'new',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_prayer_status (status),
      INDEX idx_prayer_created (created_at)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS connect_requests (
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
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'admin',
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      last_login_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  // Repair older tables created with a different schema.
  const repairs = [
    "ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS email VARCHAR(255) NULL",
    "ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS phone VARCHAR(50) NULL",
    "ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS request TEXT NULL",
    "ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'new'",
    "ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP",
    "ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP",
    "ALTER TABLE connect_requests ADD COLUMN IF NOT EXISTS email VARCHAR(255) NULL",
    "ALTER TABLE connect_requests ADD COLUMN IF NOT EXISTS phone VARCHAR(50) NULL",
    "ALTER TABLE connect_requests ADD COLUMN IF NOT EXISTS subject VARCHAR(255) NULL",
    "ALTER TABLE connect_requests ADD COLUMN IF NOT EXISTS message TEXT NULL",
    "ALTER TABLE connect_requests ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'new'",
    "ALTER TABLE connect_requests ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP",
    "ALTER TABLE connect_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP"
  ];

  for (const statement of repairs) {
    try {
      await db.query(statement);
    } catch (error) {
      // MySQL versions without IF NOT EXISTS support may report that the
      // column already exists. Keep startup running in that case.
      if (!String(error.message || '').toLowerCase().includes('exists')) {
        throw error;
      }
    }
  }
}

async function provisionInitialAdmin() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_INITIAL_PASSWORD || '');

  if (!email || !password) return;
  if (password.length < 12) {
    throw new Error('ADMIN_INITIAL_PASSWORD must be at least 12 characters');
  }

  const [existing] = await db.execute(
    'SELECT id FROM admin_users WHERE email = ? LIMIT 1',
    [email]
  );

  if (existing.length > 0) return;

  const passwordHash = await hashPassword(password);
  await db.execute(
    'INSERT INTO admin_users (email, password_hash, role) VALUES (?, ?, ?)',
    [email, passwordHash, 'admin']
  );

  console.log(`Initial admin account created for ${email}`);
}

// Serve the admin portal.
app.get(['/admin', '/admin.html', '/manage', '/portal'], (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Settings API.
app.get('/api/settings', (req, res) => {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      return res.json(JSON.parse(data));
    }
    res.json({});
  } catch (err) {
    res.status(500).json({ error: 'Failed to read settings' });
  }
});

app.post('/api/settings', requireAdmin, (req, res) => {
  try {
    const newSettings = req.body;
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(newSettings, null, 2), 'utf-8');
    res.json({ success: true, settings: newSettings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// Passkey login creates a short-lived same-origin admin session cookie.
app.post('/api/verify-passkey', (req, res) => {
  try {
    const { passkey } = req.body;
    let validPass = 'prayerarmy';

    if (fs.existsSync(SETTINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      if (data.passkey) validPass = data.passkey;
    }

    if (passkey !== validPass) {
      return res.status(401).json({ success: false, error: 'Incorrect passkey' });
    }

    setAdminSession(res);
    return res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Email/password login.
app.post('/api/admin/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const [rows] = await db.execute(
      'SELECT id, email, password_hash, role FROM admin_users WHERE email = ? AND is_active = 1 LIMIT 1',
      [email]
    );

    if (rows.length === 0 || !(await verifyPassword(password, rows[0].password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    await db.execute(
      'UPDATE admin_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?',
      [rows[0].id]
    );

    setAdminSession(res);
    res.json({
      success: true,
      user: { email: rows[0].email, role: rows[0].role }
    });
  } catch (error) {
    console.error('Admin login error:', error.message);
    res.status(500).json({ error: 'Unable to sign in' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  const cookies = parseCookies(req);
  if (cookies.admin_session) ADMIN_SESSIONS.delete(cookies.admin_session);
  res.setHeader('Set-Cookie', 'admin_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ success: true });
});

// Database health check.
app.get('/api/health/db', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT 1 AS connected');
    res.json({ success: true, database: rows[0].connected === 1 });
  } catch (error) {
    console.error('Database connection failed:', error.message);
    res.status(500).json({ success: false, error: 'Database connection failed' });
  }
});

// Public submission routes.
app.post('/api/rest/v1/prayer_requests', async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    const request = req.body.request || req.body.message || req.body.prayer_request;

    if (!name || !request) {
      return res.status(400).json({ error: 'Name and prayer request are required' });
    }

    const [result] = await db.execute(
      `INSERT INTO prayer_requests (name, email, phone, request) VALUES (?, ?, ?, ?)`,
      [name, email || null, phone || null, request]
    );

    res.status(201).json({ success: true, id: result.insertId });
  } catch (error) {
    console.error('Prayer request error:', error.message);
    res.status(500).json({ error: 'Unable to save prayer request' });
  }
});

app.post('/api/rest/v1/connect_requests', async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    if (!name || !message) {
      return res.status(400).json({ error: 'Name and message are required' });
    }

    const [result] = await db.execute(
      `INSERT INTO connect_requests (name, email, phone, subject, message)
       VALUES (?, ?, ?, ?, ?)`,
      [name, email || null, phone || null, subject || null, message]
    );

    res.status(201).json({ success: true, id: result.insertId });
  } catch (error) {
    console.error('Contact message error:', error.message);
    res.status(500).json({ error: 'Unable to save contact message' });
  }
});

// Protected admin submission management.
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

      if (status === 'new' || status === 'handled') {
        conditions.push('status = ?');
        values.push(status);
      }

      if (search) {
        if (type === 'prayer') {
          conditions.push('(name LIKE ? OR email LIKE ? OR request LIKE ?)');
          values.push(`%${search}%`, `%${search}%`, `%${search}%`);
        } else {
          conditions.push('(name LIKE ? OR email LIKE ? OR subject LIKE ? OR message LIKE ?)');
          values.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const [rows] = await db.query(
        `SELECT * FROM ${table} ${where} ORDER BY created_at DESC LIMIT 500`,
        values
      );

      submissions.push(...rows.map(row => ({ ...row, type })));
    }

    submissions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json({ success: true, submissions });
  } catch (error) {
    console.error('Submission list error:', error.message);
    res.status(500).json({ error: 'Unable to load submissions' });
  }
});

app.patch('/api/admin/submissions/:type/:id', requireAdmin, async (req, res) => {
  try {
    const table = getSubmissionTable(req.params.type);
    const id = Number(req.params.id);
    const status = req.body.status;

    if (!table || !Number.isInteger(id) || !['new', 'handled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid submission update' });
    }

    const [result] = await db.execute(
      `UPDATE ${table} SET status = ? WHERE id = ?`,
      [status, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }

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

    if (!table || !Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid submission target' });
    }

    const [result] = await db.execute(`DELETE FROM ${table} WHERE id = ?`, [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Submission deletion error:', error.message);
    res.status(500).json({ error: 'Unable to delete submission' });
  }
});

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

app.get('/api/admin/submissions/export', requireAdmin, async (req, res) => {
  try {
    const [prayers] = await db.query('SELECT id, name, email, phone, request, status, created_at FROM prayer_requests ORDER BY created_at DESC');
    const [contacts] = await db.query('SELECT id, name, email, phone, subject, message, status, created_at FROM connect_requests ORDER BY created_at DESC');

    const rows = [
      ['type', 'id', 'name', 'email', 'phone', 'subject', 'content', 'status', 'created_at'],
      ...prayers.map(row => ['prayer', row.id, row.name, row.email, row.phone, '', row.request, row.status, row.created_at]),
      ...contacts.map(row => ['contact', row.id, row.name, row.email, row.phone, row.subject, row.message, row.status, row.created_at])
    ];

    const csv = rows.map(row => row.map(csvCell).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="prayer-army-submissions.csv"');
    res.send(csv);
  } catch (error) {
    console.error('Submission export error:', error.message);
    res.status(500).json({ error: 'Unable to export submissions' });
  }
});

// Upload media endpoint.
app.post('/api/upload', requireAdmin, upload.array('files', 10), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files were uploaded' });
    }

    const uploaded = req.files.map(file => {
      const isVideo = file.mimetype.startsWith('video/');
      return {
        filename: file.filename,
        originalName: file.originalname,
        url: `assets/uploads/${file.filename}`,
        mimetype: file.mimetype,
        type: isVideo ? 'video' : 'image',
        size: file.size,
        uploadedAt: new Date().toISOString()
      };
    });

    res.json({ success: true, files: uploaded });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// List media files.
app.get('/api/media', requireAdmin, (req, res) => {
  try {
    const mediaList = [];

    if (fs.existsSync(UPLOAD_DIR)) {
      fs.readdirSync(UPLOAD_DIR).forEach(name => {
        const fullPath = path.join(UPLOAD_DIR, name);
        try {
          const stats = fs.statSync(fullPath);
          const ext = path.extname(name).toLowerCase();
          const isVideo = ['.mp4', '.webm', '.mov', '.ogg', '.m4v'].includes(ext);
          mediaList.push({
            filename: name,
            url: `assets/uploads/${name}`,
            type: isVideo ? 'video' : 'image',
            size: stats.size,
            mtime: stats.mtimeMs,
            isUpload: true
          });
        } catch {}
      });
    }

    if (fs.existsSync(IMAGES_DIR)) {
      fs.readdirSync(IMAGES_DIR).forEach(name => {
        if (name.startsWith('.')) return;
        const fullPath = path.join(IMAGES_DIR, name);
        try {
          const stats = fs.statSync(fullPath);
          mediaList.push({
            filename: name,
            url: `assets/images/${name}`,
            type: 'image',
            size: stats.size,
            mtime: stats.mtimeMs,
            isUpload: false
          });
        } catch {}
      });
    }

    mediaList.sort((a, b) => b.mtime - a.mtime);
    res.json({ success: true, media: mediaList });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve media files' });
  }
});

app.delete('/api/media/:filename', requireAdmin, (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const targetPath = path.join(UPLOAD_DIR, filename);

    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: 'File not found in uploads' });
    }

    fs.unlinkSync(targetPath);
    res.json({ success: true, message: 'File deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// This must remain the final route.
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

async function startServer() {
  try {
    await ensureTables();
    await provisionInitialAdmin();
    console.log('Database tables and admin setup are ready');

    app.listen(PORT, HOST, () => {
      console.log(`Server running at http://${HOST}:${PORT}`);
    });
  } catch (error) {
    console.error('Database initialization failed:', error.message);
    process.exit(1);
  }
}

startServer();
