-- Migration 002: configurable membership registration policy (staging only).
-- Does not modify staff accounts or the existing website.
CREATE TABLE IF NOT EXISTS membership_configuration (
 id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
 approval_mode ENUM('manual','automatic') NOT NULL DEFAULT 'manual',
 require_email_verification TINYINT(1) NOT NULL DEFAULT 1,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO membership_configuration (id,approval_mode,require_email_verification)
VALUES (1,'manual',1);
