import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import db from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SETTINGS_FILE = path.join(__dirname, 'site-settings.json');
const UPLOAD_DIR = path.join(__dirname, 'assets', 'uploads');
const IMAGES_DIR = path.join(__dirname, 'assets', 'images');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer storage setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E6);
    cb(null, `${uniqueSuffix}-${cleanName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit for video clips and high-res images
  fileFilter: (req, file, cb) => {
    // Allow images and common video formats
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
app.use(express.static(__dirname));

// Serve standalone admin portal on /admin and /manage
app.get(['/admin', '/admin.html', '/manage', '/portal'], (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Settings API
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

app.post('/api/settings', (req, res) => {
  try {
    const newSettings = req.body;
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(newSettings, null, 2), 'utf-8');
    res.json({ success: true, settings: newSettings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

app.post('/api/verify-passkey', (req, res) => {
  try {
    const { passkey } = req.body;
    let validPass = 'prayerarmy';
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      if (data.passkey) validPass = data.passkey;
    }
    if (passkey === validPass) {
      return res.json({ success: true });
    }
    return res.status(401).json({ success: false, error: 'Incorrect passkey' });
  } catch (err) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Upload media endpoint (single or multiple)
app.post('/api/upload', upload.array('files', 10), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files were uploaded' });
    }

    const uploaded = req.files.map(f => {
      const isVideo = f.mimetype.startsWith('video/');
      return {
        filename: f.filename,
        originalName: f.originalname,
        url: `assets/uploads/${f.filename}`,
        mimetype: f.mimetype,
        type: isVideo ? 'video' : 'image',
        size: f.size,
        uploadedAt: new Date().toISOString()
      };
    });

    res.json({
      success: true,
      message: `Successfully uploaded ${uploaded.length} file(s)`,
      files: uploaded
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// List all media files (uploads + bundled image assets)
app.get('/api/media', (req, res) => {
  try {
    const mediaList = [];

    // 1. Uploaded files
    if (fs.existsSync(UPLOAD_DIR)) {
      const uploadFiles = fs.readdirSync(UPLOAD_DIR);
      uploadFiles.forEach(name => {
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

    // 2. Original church images
    if (fs.existsSync(IMAGES_DIR)) {
      const imgFiles = fs.readdirSync(IMAGES_DIR);
      imgFiles.forEach(name => {
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

    // Sort by modification time descending
    mediaList.sort((a, b) => b.mtime - a.mtime);

    res.json({ success: true, media: mediaList });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve media files' });
  }
});

// Delete uploaded media file
app.delete('/api/media/:filename', (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const targetPath = path.join(UPLOAD_DIR, filename);

    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
      return res.json({ success: true, message: 'File deleted' });
    }
    res.status(404).json({ error: 'File not found in uploads' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

app.get('/{*splat}', (req, res) => {
app.get('/api/health/db', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT 1 AS connected');

    res.json({
      success: true,
      database: rows[0].connected === 1
    });
  } catch (error) {
    console.error('Database connection failed:', error.message);

    res.status(500).json({
      success: false,
      error: 'Database connection failed'
    });
  }
});

app.post('/api/rest/v1/prayer_requests', async (req, res) => {
  try {
    const { name, email, phone, request } = req.body;

    if (!name || !request) {
      return res.status(400).json({
        error: 'Name and prayer request are required'
      });
    }

    const [result] = await db.execute(
      `INSERT INTO prayer_requests
       (name, email, phone, request)
       VALUES (?, ?, ?, ?)`,
      [name, email || null, phone || null, request]
    );

    res.status(201).json({
      success: true,
      id: result.insertId
    });
  } catch (error) {
    console.error('Prayer request error:', error.message);
    res.status(500).json({
      error: 'Unable to save prayer request'
    });
  }
});

app.post('/api/rest/v1/connect_requests', async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    if (!name || !message) {
      return res.status(400).json({
        error: 'Name and message are required'
      });
    }

    const [result] = await db.execute(
      `INSERT INTO connect_requests
       (name, email, phone, subject, message)
       VALUES (?, ?, ?, ?, ?)`,
      [
        name,
        email || null,
        phone || null,
        subject || null,
        message
      ]
    );

    res.status(201).json({
      success: true,
      id: result.insertId
    });
  } catch (error) {
    console.error('Contact message error:', error.message);
    res.status(500).json({
      error: 'Unable to save contact message'
    });
  }
});

app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});


