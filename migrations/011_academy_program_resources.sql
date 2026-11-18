-- Academy program catalogue and instructor-managed downloadable learning resources.
-- Apply after 006. Feature remains disabled until migration and access QA.
CREATE TABLE IF NOT EXISTS academy_programs (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 title VARCHAR(200) NOT NULL,
 description TEXT NULL,
 level ENUM('foundation','intermediate','advanced') NOT NULL DEFAULT 'foundation',
 status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS academy_program_courses (
 program_id BIGINT UNSIGNED NOT NULL,
 course_id BIGINT UNSIGNED NOT NULL,
 position INT UNSIGNED NOT NULL DEFAULT 0,
 PRIMARY KEY(program_id,course_id),
 CONSTRAINT fk_program_course_program FOREIGN KEY(program_id) REFERENCES academy_programs(id) ON DELETE CASCADE,
 CONSTRAINT fk_program_course_course FOREIGN KEY(course_id) REFERENCES academy_courses(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS academy_resources (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 course_id BIGINT UNSIGNED NOT NULL,
 title VARCHAR(200) NOT NULL,
 kind ENUM('study_guide','scripture_reading','worksheet','reflection','reference_link') NOT NULL DEFAULT 'study_guide',
 body LONGTEXT NULL,
 external_url VARCHAR(2048) NULL,
 published TINYINT(1) NOT NULL DEFAULT 0,
 position INT UNSIGNED NOT NULL DEFAULT 0,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_academy_resources_course(course_id,published,position),
 CONSTRAINT fk_academy_resource_course FOREIGN KEY(course_id) REFERENCES academy_courses(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
