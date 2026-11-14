-- Prayer Army International - MySQL schema (safe to run more than once)
CREATE TABLE IF NOT EXISTS site_settings (
  id TINYINT UNSIGNED PRIMARY KEY,
  data LONGTEXT NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS messages (
  id CHAR(36) PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  link VARCHAR(2000) NULL,
  media_url VARCHAR(2000) NULL,
  media_type VARCHAR(5) NULL,
  notes_url VARCHAR(2000) NULL,
  source VARCHAR(6) NOT NULL DEFAULT 'manual',
  created_at DATETIME NOT NULL,
  KEY messages_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS message_comments (
  id CHAR(36) PRIMARY KEY,
  message_id CHAR(36) NOT NULL,
  name VARCHAR(80) NOT NULL,
  comment VARCHAR(1000) NOT NULL,
  created_at DATETIME NOT NULL,
  KEY comments_message (message_id, created_at),
  CONSTRAINT fk_comment_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS prayer_requests (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  contact VARCHAR(200) NULL,
  request TEXT NOT NULL,
  is_private TINYINT(1) NOT NULL DEFAULT 0,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  KEY pr_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS connect_requests (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(40) NULL,
  email VARCHAR(160) NULL,
  kind VARCHAR(12) NOT NULL DEFAULT 'visitor',
  note VARCHAR(2000) NULL,
  is_contacted TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  KEY cr_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS testimonies (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  location VARCHAR(80) NULL,
  testimony VARCHAR(1500) NOT NULL,
  is_approved TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  KEY t_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS wall_prayers (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(60) NULL,
  request VARCHAR(400) NOT NULL,
  prayed_count INT UNSIGNED NOT NULL DEFAULT 0,
  is_approved TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  KEY w_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS site_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kind VARCHAR(30) NOT NULL,
  label VARCHAR(200) NULL,
  path VARCHAR(200) NULL,
  referrer VARCHAR(200) NULL,
  device VARCHAR(10) NULL,
  created_at DATETIME NOT NULL,
  KEY se_created (created_at, kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hidden_assets (
  filename VARCHAR(255) PRIMARY KEY
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS admin_users (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  display_name VARCHAR(80) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(10) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  last_sign_in_at DATETIME NULL,
  created_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  access_hash CHAR(64) NOT NULL UNIQUE,
  access_expires DATETIME NOT NULL,
  refresh_hash CHAR(64) NOT NULL UNIQUE,
  refresh_expires DATETIME NOT NULL,
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS admin_config (
  id TINYINT UNSIGNED PRIMARY KEY,
  legacy_enabled TINYINT(1) NOT NULL DEFAULT 0,
  passkey_hash VARCHAR(255) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rate_limits (
  k VARCHAR(100) PRIMARY KEY,
  win INT UNSIGNED NOT NULL,
  hits INT UNSIGNED NOT NULL,
  ts INT UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
