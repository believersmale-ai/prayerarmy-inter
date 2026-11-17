-- Volunteer shifts and assignments; all existing records are preserved.
CREATE TABLE IF NOT EXISTS church_volunteer_shifts (
 id CHAR(36) PRIMARY KEY, group_id CHAR(36) NOT NULL, title VARCHAR(200) NOT NULL,
 role_label VARCHAR(120) NOT NULL, location VARCHAR(200) NULL, instructions TEXT NULL,
 starts_at DATETIME NOT NULL, ends_at DATETIME NOT NULL, capacity SMALLINT UNSIGNED NOT NULL,
 state VARCHAR(12) NOT NULL DEFAULT 'scheduled', version INT UNSIGNED NOT NULL DEFAULT 1,
 created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
 KEY volunteer_shift_dates(starts_at,ends_at,state), KEY volunteer_shift_group(group_id,state),
 CONSTRAINT fk_church_volunteer_group FOREIGN KEY(group_id) REFERENCES church_groups(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS church_volunteer_assignments (
 shift_id CHAR(36) NOT NULL, member_id CHAR(36) NOT NULL,
 status VARCHAR(12) NOT NULL DEFAULT 'assigned', assigned_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
 PRIMARY KEY(shift_id,member_id), KEY volunteer_assignment_member(member_id,status),
 CONSTRAINT fk_church_volunteer_assignment_shift FOREIGN KEY(shift_id) REFERENCES church_volunteer_shifts(id),
 CONSTRAINT fk_church_volunteer_assignment_member FOREIGN KEY(member_id) REFERENCES church_members(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Serialize scheduler writes across application processes, including cross-shift conflicts.
CREATE TABLE IF NOT EXISTS church_schedule_lock (
 id TINYINT UNSIGNED PRIMARY KEY
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO church_schedule_lock(id) VALUES (1);
