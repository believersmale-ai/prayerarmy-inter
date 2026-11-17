# Staging acceptance checklist

## Isolation requirements
- Use a **separate staging subdomain/application**, not the production Passenger app root.
- Do not change production `public_html/.htaccess` or `hbuilds/current` manually.
- Configure staging with a **separate database** and separate writable data directory. Import a privacy-sanitized backup only if required; do not use production database credentials in staging.
- Restrict access to staging and block search engine indexing.
- Keep production `/blog` and all public routes unchanged.

## Before any deploy
- Verify an accessible MySQL export and a backup of current uploaded media and site settings.
- Record the current production commit, build ID and rollback procedure.
- Run the GitHub syntax workflow on this branch.
- Check `node --check server.js` and `node --check script.js` in the staging environment.

## Test staging only
```bash
/opt/alt/alt-nodejs22/root/bin/node scripts/smoke-production.mjs https://STAGING-DOMAIN
/opt/alt/alt-nodejs22/root/bin/node scripts/smoke-content.mjs https://STAGING-DOMAIN
```
These scripts make only read-only HTTP requests. They do not verify database moderation rules by themselves.

## Manual approval/privacy verification
1. Insert or identify a **synthetic** approved and unapproved testimony in the **staging** database. Confirm only approved content appears publicly.
2. Repeat for prayer-wall requests. Confirm anonymous public responses do not expose `is_approved` or private contact details.
3. Confirm sermon links and media play correctly.
4. Confirm the public settings API excludes `passkey` and `notifications`.
5. Test admin login, sign-out, unauthorized requests, media upload, settings edit and persistence across restart. Existing admin.js still depends on PHP-style endpoints and is **not yet compatible** with Node's admin API.
6. Confirm the homepage, mobile navigation, contact and prayer forms, and any staging blog route.
7. Restart and redeploy staging, then confirm settings and media persist when `PAI_DATA_DIR` is configured.

## Stop conditions
Do not deploy to production if any required API is missing, content moderation fails, admin editing is broken, a file disappears after restart, or the production rollback procedure is unverified.
