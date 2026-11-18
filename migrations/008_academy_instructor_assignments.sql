-- Academy instructional assignments. Backup first; deploy only after QA.
-- Staff IDs reference the existing administrator identity without assuming a particular admin table.
CREATE TABLE IF NOT EXISTS academy_instructor_assignments (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 course_id BIGINT UNSIGNED NOT NULL,
 staff_id VARCHAR(191) NOT NULL,
 assigned_at DATETIME NOT NULL,
 assigned_by VARCHAR(191) NOT NULL,
 UNIQUE KEY uq_academy_instructor_course(course_id,staff_id),
 INDEX idx_academy_instructor_staff(staff_id),
 CONSTRAINT fk_academy_instructor_course FOREIGN KEY(course_id) REFERENCES academy_courses(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
