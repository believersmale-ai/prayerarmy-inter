-- Apply to the active site database after backup. Existing assets are not deleted.
CREATE TABLE IF NOT EXISTS site_hidden_assets (
 filename VARCHAR(255) NOT NULL PRIMARY KEY,
 hidden_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
