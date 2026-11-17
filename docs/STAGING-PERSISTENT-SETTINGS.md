# Staging persistent settings rollout

The site manager previously saved `site-settings.json` in the deployment directory. Hostinger deployments may replace that file. This change moves settings to the existing staging MySQL database, without changing production.

1. Back up the **existing staging database** and, if possible, the current `site-settings.json` from the currently running deployment (it may contain recent edits not committed to GitHub).
2. Apply `migrations/003_persistent_site_settings.sql` to the **same staging database** used by Node.js.
3. **Before redeploying**, if the currently running deployment has newer `site-settings.json` content than the repository, preserve it separately. The new application seeds the MySQL row once from the file in its *new deployment*, so recent changes in an older build may otherwise be lost. If needed, restore the newer JSON into the table after migration using a controlled administrator import rather than deleting the table.
4. Deploy staging branch `audit/hostinger-production-readiness`. On the first GET to `/api/settings`, an empty `site_settings_store` table is seeded once from bundled settings. Subsequent deployments read the existing row and never overwrite it.
5. Log into `/admin.html`, change a harmless test value, save, and refresh. Verify the new value persists in the admin editor and on the public site. Check the row revision increments in phpMyAdmin:
   `SELECT id, revision, updated_at FROM site_settings_store WHERE id=1;`
6. Redeploy the same branch, then verify the test value remains. If settings fail to load or save, inspect Runtime logs for `Persistent settings read failed` or `Persistent settings write failed`.

**Important:** Do not delete or truncate `site_settings_store` after content editing begins. The public endpoint deliberately returns 503 if the migration is missing, rather than pretending settings were saved. This migration covers website settings and content stored inside the settings JSON; media files and other separate modules require their own persistent storage work.
