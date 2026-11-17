-- Ministry and small-group rosters. Existing church records are preserved.
CREATE TABLE IF NOT EXISTS church_groups (
 id CHAR(36) PRIMARY KEY, name VARCHAR(150) NOT NULL, kind VARCHAR(20) NOT NULL,
 description TEXT NULL, location VARCHAR(200) NULL, meeting_details VARCHAR(300) NULL,
 version INT UNSIGNED NOT NULL DEFAULT 1, archived_at DATETIME NULL,
 created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
 KEY group_name(name), KEY group_kind(kind,archived_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS church_group_members (
 group_id CHAR(36) NOT NULL, member_id CHAR(36) NOT NULL,
 role VARCHAR(10) NOT NULL DEFAULT 'member', joined_at DATETIME NOT NULL, left_at DATETIME NULL,
 PRIMARY KEY(group_id,member_id), KEY group_member(member_id,left_at),
 CONSTRAINT fk_church_group_roster_group FOREIGN KEY(group_id) REFERENCES church_groups(id),
 CONSTRAINT fk_church_group_roster_member FOREIGN KEY(member_id) REFERENCES church_members(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
