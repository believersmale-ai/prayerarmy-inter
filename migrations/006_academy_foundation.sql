-- Phase 2 / Academy foundation. Staging only; backup before applying.
-- MySQL 8 / MariaDB 10.4+, InnoDB, utf8mb4. Existing tables untouched.
-- This migration prepares the data model; no examinations are activated by running it.
CREATE TABLE IF NOT EXISTS academy_courses (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 title VARCHAR(200) NOT NULL,
 slug VARCHAR(200) NOT NULL,
 description TEXT NULL,
 status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_academy_course_slug(slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS academy_lessons (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 course_id BIGINT UNSIGNED NOT NULL,
 title VARCHAR(200) NOT NULL,
 content LONGTEXT NULL,
 position INT UNSIGNED NOT NULL DEFAULT 0,
 published TINYINT(1) NOT NULL DEFAULT 0,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_academy_lessons_course(course_id,position),
 CONSTRAINT fk_academy_lesson_course FOREIGN KEY(course_id) REFERENCES academy_courses(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS academy_enrollments (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 course_id BIGINT UNSIGNED NOT NULL,
 account_id BIGINT UNSIGNED NOT NULL,
 status ENUM('active','completed','withdrawn') NOT NULL DEFAULT 'active',
 enrolled_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 completed_at DATETIME NULL,
 UNIQUE KEY uq_academy_enrollment(course_id,account_id),
 INDEX idx_academy_enrollment_account(account_id,status),
 CONSTRAINT fk_academy_enroll_course FOREIGN KEY(course_id) REFERENCES academy_courses(id) ON DELETE RESTRICT,
 CONSTRAINT fk_academy_enroll_account FOREIGN KEY(account_id) REFERENCES public_accounts(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS academy_assessments (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 course_id BIGINT UNSIGNED NOT NULL,
 title VARCHAR(200) NOT NULL,
 kind ENUM('assignment','exam') NOT NULL,
 status ENUM('draft','active','closed') NOT NULL DEFAULT 'draft',
 opens_at DATETIME NULL,
 closes_at DATETIME NULL,
 duration_minutes SMALLINT UNSIGNED NULL,
 max_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 1,
 result_policy ENUM('immediate','after_close','manual') NOT NULL DEFAULT 'manual',
 passing_percent DECIMAL(5,2) NOT NULL DEFAULT 50.00,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_academy_assessment_window(course_id,status,opens_at,closes_at),
 CONSTRAINT fk_academy_assess_course FOREIGN KEY(course_id) REFERENCES academy_courses(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS academy_questions (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 assessment_id BIGINT UNSIGNED NOT NULL,
 question_text TEXT NOT NULL,
 question_type ENUM('single_choice','multiple_choice','essay') NOT NULL,
 points DECIMAL(8,2) NOT NULL DEFAULT 1.00,
 position INT UNSIGNED NOT NULL DEFAULT 0,
 INDEX idx_academy_question_order(assessment_id,position),
 CONSTRAINT fk_academy_question_assess FOREIGN KEY(assessment_id) REFERENCES academy_assessments(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS academy_options (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 question_id BIGINT UNSIGNED NOT NULL,
 option_text TEXT NOT NULL,
 is_correct TINYINT(1) NOT NULL DEFAULT 0,
 position INT UNSIGNED NOT NULL DEFAULT 0,
 INDEX idx_academy_options_question(question_id,position),
 CONSTRAINT fk_academy_option_question FOREIGN KEY(question_id) REFERENCES academy_questions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS academy_attempts (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 assessment_id BIGINT UNSIGNED NOT NULL,
 account_id BIGINT UNSIGNED NOT NULL,
 attempt_number SMALLINT UNSIGNED NOT NULL,
 started_at DATETIME NOT NULL,
 deadline_at DATETIME NULL,
 submitted_at DATETIME NULL,
 status ENUM('in_progress','submitted','graded','expired') NOT NULL DEFAULT 'in_progress',
 earned_points DECIMAL(10,2) NULL,
 possible_points DECIMAL(10,2) NULL,
 graded_at DATETIME NULL,
 UNIQUE KEY uq_academy_attempt(assessment_id,account_id,attempt_number),
 INDEX idx_academy_attempt_student(account_id,status),
 CONSTRAINT fk_academy_attempt_assess FOREIGN KEY(assessment_id) REFERENCES academy_assessments(id) ON DELETE RESTRICT,
 CONSTRAINT fk_academy_attempt_account FOREIGN KEY(account_id) REFERENCES public_accounts(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS academy_answers (
 attempt_id BIGINT UNSIGNED NOT NULL,
 question_id BIGINT UNSIGNED NOT NULL,
 answer_json LONGTEXT NOT NULL,
 points_awarded DECIMAL(8,2) NULL,
 feedback TEXT NULL,
 graded_by BIGINT UNSIGNED NULL,
 graded_at DATETIME NULL,
 PRIMARY KEY(attempt_id,question_id),
 CONSTRAINT fk_academy_answer_attempt FOREIGN KEY(attempt_id) REFERENCES academy_attempts(id) ON DELETE RESTRICT,
 CONSTRAINT fk_academy_answer_question FOREIGN KEY(question_id) REFERENCES academy_questions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS academy_certificates (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 enrollment_id BIGINT UNSIGNED NOT NULL,
 verification_token CHAR(64) NOT NULL,
 issued_at DATETIME NOT NULL,
 revoked_at DATETIME NULL,
 UNIQUE KEY uq_academy_certificate_enrollment(enrollment_id),
 UNIQUE KEY uq_academy_certificate_token(verification_token),
 CONSTRAINT fk_academy_certificate_enrollment FOREIGN KEY(enrollment_id) REFERENCES academy_enrollments(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
