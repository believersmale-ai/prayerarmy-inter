-- Prayer Army International: persistent site settings in the existing staging database.
-- Apply to staging only after a database backup.
-- Do not drop or replace existing tables.
CREATE TABLE IF NOT EXISTS site_settings_store (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  settings_json LONGTEXT NOT NULL,
  revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CHECK (JSON_VALID(settings_json))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
