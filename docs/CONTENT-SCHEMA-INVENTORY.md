# Production content-table schema inventory (read-only)

Database confirmed by operator's phpMyAdmin screenshot: `u517067943_prayerforms`.

Tables shown:
- admin_users
- connect_requests
- prayer_requests
- site_content_messages
- site_content_testimonies
- site_content_wall_prayers

The current Node server creates/repairs only admin_users, connect_requests and prayer_requests. It does not yet expose the public sermon/testimony/prayer-wall API routes required by script.js. Do not create duplicate `messages`, `testimonies`, or `wall_prayers` tables without examining the existing site_content_* schema and records.

## Safe schema inspection

In phpMyAdmin select `u517067943_prayerforms`, then open the SQL tab and run:

```sql
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'u517067943_prayerforms'
  AND TABLE_NAME IN ('site_content_messages','site_content_testimonies','site_content_wall_prayers')
ORDER BY TABLE_NAME, ORDINAL_POSITION;
```

This returns only structural metadata, not church members' personal details or actual content. After review, add read-only API handlers with explicit public field allowlists, approval checks and pagination. Do not expose private requests or draft/unapproved testimonies.
