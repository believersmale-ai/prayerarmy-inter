-- Church management foundation. Additive: existing website and public accounts are unchanged.
CREATE TABLE IF NOT EXISTS church_households (
 id CHAR(36) PRIMARY KEY, name VARCHAR(150) NOT NULL, phone VARCHAR(40) NULL,
 email VARCHAR(190) NULL, address VARCHAR(1000) NULL, primary_contact_id CHAR(36) NULL,
 version INT UNSIGNED NOT NULL DEFAULT 1, archived_at DATETIME NULL,
 created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, KEY household_name(name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS church_members (
 id CHAR(36) PRIMARY KEY, first_name VARCHAR(120) NOT NULL, last_name VARCHAR(120) NULL,
 preferred_name VARCHAR(120) NULL, email VARCHAR(190) NULL, phone VARCHAR(40) NULL,
 birth_date DATE NULL, joined_date DATE NOT NULL, membership_status VARCHAR(12) NOT NULL DEFAULT 'visitor',
 household_id CHAR(36) NULL, relationship VARCHAR(50) NULL, account_id VARCHAR(64) NULL,
 version INT UNSIGNED NOT NULL DEFAULT 1, archived_at DATETIME NULL,
 created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
 UNIQUE KEY member_account(account_id), KEY member_name(last_name,first_name),
 KEY member_email(email), KEY member_status(membership_status,archived_at),
 CONSTRAINT fk_church_member_household FOREIGN KEY(household_id) REFERENCES church_households(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS church_sessions (
 id CHAR(36) PRIMARY KEY, title VARCHAR(200) NOT NULL, location VARCHAR(200) NULL,
 starts_at DATETIME NOT NULL, ends_at DATETIME NOT NULL,
 state VARCHAR(12) NOT NULL DEFAULT 'scheduled', guest_count INT UNSIGNED NOT NULL DEFAULT 0,
 opened_at DATETIME NULL, version INT UNSIGNED NOT NULL DEFAULT 1,
 created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, KEY session_dates(starts_at,state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS church_roster (
 session_id CHAR(36) NOT NULL, member_id CHAR(36) NOT NULL, added_at DATETIME NOT NULL,
 PRIMARY KEY(session_id,member_id),
 CONSTRAINT fk_church_roster_session FOREIGN KEY(session_id) REFERENCES church_sessions(id),
 CONSTRAINT fk_church_roster_member FOREIGN KEY(member_id) REFERENCES church_members(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS church_attendance (
 session_id CHAR(36) NOT NULL, member_id CHAR(36) NOT NULL, status VARCHAR(10) NOT NULL,
 checked_in_at DATETIME NULL, recorded_by VARCHAR(64) NOT NULL, recorded_at DATETIME NOT NULL,
 version INT UNSIGNED NOT NULL DEFAULT 1, PRIMARY KEY(session_id,member_id),
 KEY attendance_member(member_id,session_id),
 CONSTRAINT fk_church_attendance_roster FOREIGN KEY(session_id,member_id) REFERENCES church_roster(session_id,member_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS church_activity (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, actor_id VARCHAR(64) NULL,
 entity_type VARCHAR(30) NOT NULL, entity_id CHAR(36) NOT NULL, action VARCHAR(50) NOT NULL,
 changed_fields TEXT NULL, created_at DATETIME NOT NULL, KEY church_activity_date(created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS church_import_batches (
 id CHAR(36) PRIMARY KEY, actor_id VARCHAR(64) NULL, content_hash CHAR(64) NOT NULL,
 imported_count INT UNSIGNED NOT NULL, created_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
