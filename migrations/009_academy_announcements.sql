-- Academy course announcements: apply after 006 and 008, with a database backup.
CREATE TABLE IF NOT EXISTS academy_announcements (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 course_id BIGINT UNSIGNED NOT NULL,
 author_staff_id VARCHAR(191) NOT NULL,
 title VARCHAR(180) NOT NULL,
 body TEXT NOT NULL,
 published_at DATETIME NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_academy_announcements_course(course_id,published_at,id),
 CONSTRAINT fk_academy_announcement_course FOREIGN KEY(course_id) REFERENCES academy_courses(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
