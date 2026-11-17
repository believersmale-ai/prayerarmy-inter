-- PAI shared public identity, migration 001 (MySQL 8 / MariaDB 10.4+)
-- STAGING FIRST. Do not import into production before backup and approval.
-- Staff admin_users remains separate and unchanged.
CREATE TABLE IF NOT EXISTS public_accounts (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 email VARCHAR(254) NOT NULL,
 password_hash VARCHAR(255) NOT NULL,
 display_name VARCHAR(150) NOT NULL,
 status ENUM('pending','active','suspended','closed') NOT NULL DEFAULT 'pending',
 email_verified_at DATETIME NULL,
 last_login_at DATETIME NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_public_email (email),
 KEY idx_public_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS public_account_roles (
 account_id BIGINT UNSIGNED NOT NULL,
 role ENUM('member','student','blogger') NOT NULL,
 granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (account_id,role),
 CONSTRAINT fk_public_role_account FOREIGN KEY (account_id) REFERENCES public_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS public_auth_tokens (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 account_id BIGINT UNSIGNED NOT NULL,
 token_hash BINARY(32) NOT NULL,
 purpose ENUM('verify_email','reset_password','session') NOT NULL,
 expires_at DATETIME NOT NULL,
 consumed_at DATETIME NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_auth_token_hash (token_hash),
 KEY idx_auth_account (account_id,purpose),
 KEY idx_auth_expiry (expires_at),
 CONSTRAINT fk_auth_account FOREIGN KEY (account_id) REFERENCES public_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS public_audit_events (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 actor_account_id BIGINT UNSIGNED NULL,
 action VARCHAR(100) NOT NULL,
 subject_type VARCHAR(80) NOT NULL,
 subject_id VARCHAR(80) NULL,
 metadata_json LONGTEXT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY idx_audit_actor (actor_account_id,created_at),
 KEY idx_audit_subject (subject_type,subject_id),
 CONSTRAINT fk_audit_actor FOREIGN KEY (actor_account_id) REFERENCES public_accounts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
