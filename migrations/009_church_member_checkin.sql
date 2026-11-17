-- Member check-in is opt-in per service; existing attendance is preserved.
CREATE TABLE IF NOT EXISTS church_checkin_settings (
 session_id CHAR(36) PRIMARY KEY, enabled TINYINT NOT NULL DEFAULT 0,
 opens_at DATETIME NOT NULL, closes_at DATETIME NOT NULL, code_hash CHAR(64) NOT NULL,
 updated_at DATETIME NOT NULL,
 CONSTRAINT fk_church_checkin_session FOREIGN KEY(session_id) REFERENCES church_sessions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS church_self_checkins (
 session_id CHAR(36) NOT NULL, member_id CHAR(36) NOT NULL, account_id VARCHAR(64) NOT NULL,
 checked_in_at DATETIME NOT NULL, PRIMARY KEY(session_id,member_id), KEY self_checkin_account(account_id),
 CONSTRAINT fk_church_self_checkin_roster FOREIGN KEY(session_id,member_id) REFERENCES church_roster(session_id,member_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS church_checkin_limits (
 account_id VARCHAR(64) PRIMARY KEY, bucket_started_at DATETIME NOT NULL, attempts INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
