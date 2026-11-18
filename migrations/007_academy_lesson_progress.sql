-- Academy lesson completion tracking. Apply only after backing up the production database.
CREATE TABLE IF NOT EXISTS academy_lesson_progress (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 enrollment_id BIGINT UNSIGNED NOT NULL,
 lesson_id BIGINT UNSIGNED NOT NULL,
 completed_at DATETIME NOT NULL,
 UNIQUE KEY uq_academy_lesson_progress(enrollment_id,lesson_id),
 INDEX idx_academy_lesson_progress_lesson(lesson_id),
 CONSTRAINT fk_academy_progress_enrollment FOREIGN KEY(enrollment_id) REFERENCES academy_enrollments(id) ON DELETE RESTRICT,
 CONSTRAINT fk_academy_progress_lesson FOREIGN KEY(lesson_id) REFERENCES academy_lessons(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
