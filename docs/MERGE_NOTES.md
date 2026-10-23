# Merge notes

Base: v20 (index.html, styles.css, script.js, admin.html, admin.js, README.md).
v20's index.html contains every element ID that script.js expects (110 of 110).
The other zip's index.html was missing 98 of them and pointed at a non-existent
assets/images/logo.png, so it was not used.

Added from the other zip:
- supabase/functions/manage-content and delete-media (admin.js calls both)
- supabase/migrations/0001_messages_comments_requests.sql
- docs/DEPLOY_*.md (deployment notes)

Left out on purpose:
- server.js: Express upload server; the site is static on Vercel and package.json has no dependencies for it
- pnpm-lock.yaml: empty
- assets/images/statement-of-faith.png (2 MB): unused; the site uses the .jpg

Heads-up: those two Edge Functions are the older passkey-era versions. README.md
describes role-based checks, and admin.js also calls admin-users, change-passkey,
save-settings, upload-media and verify-passkey, none of which are in either zip.
Compare against what is deployed in Supabase before redeploying.
