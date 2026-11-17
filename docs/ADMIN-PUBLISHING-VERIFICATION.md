# Admin-to-public publishing verification (main)

## Changes audited
- The public `/api/settings` and legacy `/site-settings.json` endpoints now read the **same MySQL** `site_settings_store` row.
- Public pages no longer treat a browser's `pai_site_settings` localStorage value as published content.
- The admin save flow verifies the updated revision through a fresh public settings read before displaying “saved”.
- Saving one editor section preserves unrelated nested settings keys.
- The caption publishing panel refreshes when a media upload succeeds.
- `/api/admin/publishing-health` (authenticated, settings permission) reports settings revision, media migration status, and whether an external upload directory is configured.

## Required Hostinger setup
1. Back up the production MySQL database and any currently used media directory.
2. Ensure migration `003_persistent_site_settings.sql` is present in the **production** database; ensure migration `004_media_captions.sql` is present for caption publishing. Never import the staging data over production.
3. Configure `PAI_DATA_DIR` as an **absolute, persistent path outside the versioned deployment**, with write access for Node. Existing uploads are **not automatically migrated**; copy them to the configured `uploads` directory before switching.
4. Deploy `main`. The app should be using the intended production DB connection.
5. In the admin portal, edit a harmless hero subtitle, save, then refresh both `/api/settings` and the homepage in a private window. Compare the value. Reload the admin editor and confirm it persists.
6. Open `/api/admin/publishing-health` while logged in; verify `settingsDatabase=connected`, `mediaDatabase=connected`, `mediaStorage=persistent_directory_configured`. A 401/403 indicates the current account lacks settings permission.
7. Upload a small photo, enter a caption, enable “Show on homepage”, save, refresh the public gallery. Redeploy and verify the image and caption still appear.
8. Test a media-only account: it can upload and publish media but cannot change unrelated site settings. Test that unauthorized public visitors cannot call protected endpoints.

## Remaining limitations
- These commits do not prove a Hostinger deployment or DB migration has occurred.
- Bundled gallery photos remain intentionally unchanged.
- Separate content APIs (prayers, testimonies, comments, sermons, events) have independent storage and permissions and require module-specific tests.
- A deployment directory is **not** durable media storage. If `PAI_DATA_DIR` is unset, uploads may be lost on redeploy.
- The public site uses bundled defaults if its settings database is unavailable. This is not evidence of successful publication.
