-- Academy applications and secure invitation-based account activation.
-- Apply after 001, 002 and 006; run in staging first.
CREATE TABLE IF NOT EXISTS academy_applications (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 course_id BIGINT UNSIGNED NOT NULL,
 full_name VARCHAR(150) NOT NULL,
 email VARCHAR(254) NOT NULL,
 phone VARCHAR(35) NULL,
 motivation TEXT NOT NULL,
 status ENUM('pending','admitted','rejected') NOT NULL DEFAULT 'pending',
 account_id BIGINT UNSIGNED NULL,
 reviewed_by VARCHAR(191) NULL,
 reviewed_at DATETIME NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_academy_application_course_email(course_id,email),
 INDEX idx_academy_application_status(status,created_at),
 CONSTRAINT fk_academy_application_course FOREIGN KEY(course_id) REFERENCES academy_courses(id) ON DELETE RESTRICT,
 CONSTRAINT fk_academy_application_account FOREIGN KEY(account_id) REFERENCES public_accounts(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS academy_admission_invites (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 application_id BIGINT UNSIGNED NOT NULL,
 token_hash CHAR(64) NOT NULL,
 expires_at DATETIME NOT NULL,
 used_at DATETIME NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_academy_invite_token(token_hash),
 INDEX idx_academy_invite_application(application_id,used_at),
 CONSTRAINT fk_academy_invite_application FOREIGN KEY(application_id) REFERENCES academy_applications(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
