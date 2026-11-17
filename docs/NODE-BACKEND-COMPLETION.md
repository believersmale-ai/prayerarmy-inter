# Node backend completion — 17 November 2026

The Node modules previously listed as unfinished are now implemented. This report supersedes the remaining-work section in `BUGFIX-VALIDATION-2026-11-17.md`. Code and tests are on `audit/hostinger-production-readiness`; this is not a production-deployment report.

## Completed functionality

- Public sermons and metadata; create/edit/delete sermons, featured flags, uploaded media and recording links.
- Public comments with signed form tokens, bounds and rate limiting; staff deletion; comments are removed with their sermon.
- Testimony submission, editing, approval/unpublishing and deletion. Names require explicit consent. Pending content stays private.
- Prayer-wall submission, moderation, editing and deletion. Transactional voting deduplicates concurrent clicks and enforces the shared-network daily cap.
- Private prayer requests, visitor enquiries, read/contacted flags and follow-up notes. These remain restricted to pastoral-care staff and system admins.
- Real dashboard counts and activity per role, bounded visitor analytics, and retention cleanup.
- Search across public sermons, published events, current announcements and ministry content.
- Podcasts, sitemap, robots, About/Contact pages, Markdown negotiation, JSON-LD, llms.txt, WebMCP and a read-only MCP server.
- Notification preferences and SMTP delivery. Alerts omit private submission text.
- Staff accounts and roles, password changes/resets, account suspension/deletion and shared-passkey management. A transaction protects the last active system admin even during competing role changes.
- MySQL-backed staff sessions survive restarts. Disabling an account or resetting its password revokes sessions; changed roles are checked on every request. Public-member authentication stays separate.
- Existing membership registration, manual approval and automatic approval after email verification use the patched mail library. A manual-approval confirmation no longer falsely promises immediate access.
- Upload content detection rejects disguised SVG/text files; sandbox headers also restrict active content in legacy uploads; failed batches are removed. Media and staff APIs enforce role permissions and same-origin writes.
- Editors can save content but cannot overwrite the security-only tracking configuration, on either backend.

## Runtime and deployment requirements

Use **Node 22 or newer**. The repository audit records Node 22 for Hostinger. Production dependencies `file-type` and `nodemailer` were upgraded to patched versions; `pnpm audit --prod --json` reported zero known vulnerabilities after the upgrade.

The selected database must use the Node staff/submission layout. Startup checks for the separate PHP staff layout and refuses to alter it. PHP remains a supported, independently deployed backend; this update does not silently convert PHP account/password or settings storage into Node tables.

On Node startup, `migrations/004_node_modules.sql` creates missing module tables. Additional code checks schema metadata before adding missing sermon metadata/consent columns. Existing `site_content_*` tables and IDs are retained; integer, UUID and BIGINT IDs are supported. No tables are dropped and no existing consent flags or records are rewritten. Public account migrations 001/002 initialize only when public accounts are enabled.

Before deploying an upgrade, back up the database and uploaded files, retain the current build for rollback, and validate on the intended staging database. Read `/api/runtime` to identify the backend and readiness/storage flags. `/api/health/db` reports failure if initialization did not complete, even if a raw database connection succeeds.

Required Node database variables: `DB_HOST`, `DB_PORT` (defaults to 3306), `DB_USER`, `DB_PASSWORD`, `DB_NAME`.

Initial staff account: `ADMIN_EMAIL` and `ADMIN_INITIAL_PASSWORD`. Existing accounts are not overwritten. `ADMIN_FORCE_RESET=true` is an explicit, one-time recovery option; it revokes the account's sessions and restores its system-admin profile. Remove that flag after recovery. `ADMIN_PASSKEY` is an optional initial shared passkey, subsequently managed through the private database configuration.

Set `NODE_ENV=production` behind Hostinger's HTTPS proxy. Staff writes require HTTPS in production. Configure **`PAI_DATA_DIR` as an absolute, durable directory outside versioned build folders**, preserve/copy existing uploaded files there, and verify its ownership and backups before switching. Production uploads fail explicitly until this directory is configured, preventing new files from silently disappearing on the next deployment. Settings and staff sessions are already persisted in MySQL. Existing upload URLs retain the `/assets/uploads/` prefix.

Email configuration uses `PAI_SMTP_HOST`, `PAI_SMTP_PORT` (587 or 465), `PAI_SMTP_USER`, `PAI_SMTP_PASS`, and `PAI_MAIL_FROM`. Production SMTP uses TLS/STARTTLS. `PAI_PUBLIC_BASE_URL` must be the real HTTPS website origin for email verification. Keep these values in hosting environment settings, never in Git or chat. Staff notifications can remain off until a sender is configured.

Membership remains opt-in through `PAI_PUBLIC_ACCOUNTS_ENABLED=true` and `PAI_PUBLIC_REGISTRATION_ENABLED=true`. The default policy requires verification and manual approval; configure SMTP and review policy before opening registration.

## Validation performed

All mutations used disposable local databases and fictitious identities. No production credentials, database contents or hosting files were accessed.

- Full Node database integration suite on **Node 22.23.5**, in four configurations: existing numeric IDs, existing UUID IDs, fresh module tables and existing BIGINT IDs above JavaScript's safe-integer range.
- The suite exercises every content module, approval/privacy boundaries, role restrictions, competing owner changes, concurrent voting, settings conflicts, session/password revocation, media upload/delete and spoofed-file rejection, actual SMTP submission to a local test server, email verification, membership approval, and session/settings/form-token persistence across a process restart, HTTPS enforcement, and durable media across production process restarts.
- Chromium on both Node and PHP: homepage and all accessible admin views for owner (24), editor (19), media (4), and pastoral care (6). Layout checked at 390, 768 and 1440 pixels; no JavaScript or same-origin HTTP errors during the tested navigation.
- Real Apache/PHP integration checks, including routes and file protections, forms, per-role access, anonymous approved testimonies, scheduled/expiring announcement search, tracking-permission enforcement and concurrent vote limits.
- Syntax checks on JavaScript and PHP; `git diff --check`; production dependency audit.

Reproduce routing tests with `npm test`. Set `PHP_TEST_URL` to a local Apache deployment to include its optional test group.

Run `npm run test:database` against a disposable MySQL/MariaDB server configured with `PAI_TEST_DB_HOST`, `PAI_TEST_DB_PORT`, `PAI_TEST_DB_USER`, `PAI_TEST_DB_PASSWORD`. The test creates a unique `pai_regression_*` database and removes it afterward. Add `PAI_TEST_UUID_SCHEMA=true`, `PAI_TEST_FRESH_SCHEMA=true`, or `PAI_TEST_BIGINT_SCHEMA=true` to exercise the other layouts. SMTP testing is local and sends no external mail.

## Hosting status

Hostinger's account tools are not connected in this session. The CLI reported no configured `hostinger` MCP server. Consequently, the actual production schema, Node/PHP selection, persistent storage, SSL/proxy headers, SMTP credentials and current deployment cannot be verified here. No live deploy or live database migration has been performed. Real external mail delivery and streaming-provider playback still require live configuration and verification; the code paths have been tested locally.
