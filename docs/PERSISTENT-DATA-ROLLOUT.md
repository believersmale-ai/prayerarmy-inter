# Persistent data rollout — NOT YET DEPLOYED

This branch adds an **opt-in** environment variable, `PAI_DATA_DIR`, to `server.js`. Without it, the original settings and upload locations remain unchanged. No database schema or public URL changes are required by this patch.

## Why
Hostinger builds are versioned. Previously, editable `site-settings.json` and `assets/uploads/` were written inside `hbuilds/current/nodejs`; deployment replacement can discard those changes.

## Before enabling
1. Export the production MySQL database from hPanel and verify the backup can be read.
2. Back up the existing `site-settings.json` and `assets/uploads/` from the **currently running** build, preserving file permissions. Do not share credentials or sensitive user data.
3. Choose a durable private directory outside `hbuilds`, outside `public_html`, and outside Git. Ensure the Node process has read/write access. Do not use a web-accessible path.
4. While writes are paused, copy the existing settings and uploads to `<PAI_DATA_DIR>/site-settings.json` and `<PAI_DATA_DIR>/uploads/`. Verify counts, sizes, permissions and a sample file. If no settings file is present, the server seeds it from bundled defaults, which is **not** a replacement for migrating production edits.
5. Configure `PAI_DATA_DIR` as an **absolute** path in Hostinger's Node.js environment settings. Keep existing DB variables intact. Confirm how Hostinger retains custom environment variables across redeployments.
6. Test on staging first: settings read/save/restart, upload/read/delete, public media URL, permissions, and rollback with the variable unset. Confirm existing uploads are served from the new location.
7. Schedule an approved deployment, monitor errors, and keep both backup and old build until verified.

## Behavior
- When unset: existing bundled `site-settings.json` and `assets/uploads/` behavior.
- When set: settings saved to `PAI_DATA_DIR/site-settings.json`; uploaded media saved to `PAI_DATA_DIR/uploads/`, served at existing `/assets/uploads/...` URLs.
- Existing admin authentication and API routes are unchanged.
- No automatic migration is performed; this is intentional to prevent overwriting production content.

## Remaining risks
- This is not a full persistence solution for sessions, backend API compatibility, or the PHP-only modules.
- Confirm the Hostinger deploy process preserves the configured external directory.
- A future test suite should exercise both legacy and persistent-data modes.
