# Shared public accounts — staged foundation

This is the first, **schema-only** step of the uploaded Membership, Attendance, Academy & Multi-Author Blog specification, adapted to the existing Hostinger Node.js/Express + MySQL deployment.

## Existing architecture
- Live/staging application entry: `server.js` (Express); database connection: `database.js` (mysql2).
- Existing staff administration: `admin_users`; **do not merge** with public accounts.
- Existing PHP `api/` is present in the repository, but PHP routes are not executed by the Node-only deployment. Public modules must use Express routes and the same MySQL database connection.
- Staging and production must have separate database credentials, storage, and email sender configuration.

## Included now
`migrations/001_public_identity.sql` creates four tables: `public_accounts`, `public_account_roles`, `public_auth_tokens`, `public_audit_events`. It does not modify existing tables and is not run automatically. No public registration/login endpoint is enabled yet.

## Before applying to staging
1. Confirm the deployed staging branch and that `DB_NAME` points to the **staging** MySQL database.
2. Export the staging database in phpMyAdmin and retain a rollback copy.
3. Review the migration and import **only** into staging phpMyAdmin.
4. Verify the four new tables exist; verify `admin_users`, `connect_requests`, `prayer_requests`, and current public website still work.
5. Do not copy production user records into staging without consent and protection.

## Next implementation (not yet enabled)
- Server-side registration/login/logout and session handling with hashed passwords, email verification, reset tokens, throttling, CSRF protection and secure cookies.
- Role grants managed by authorized staff only; no self-service elevation to blogger.
- Membership/attendance migration and self-check-in with server-side session windows and unique check-in constraints.
- Academy, then blog subdomain.

## Required decisions
Membership fields, approval policy, branches/groups, guest attendance, check-in window and QR policy, email provider, retention policy, academy grading and blog author approval. Do not invent church policies.

## Safety and verification
Run real-DB tests for duplicate emails, expired/consumed tokens, cross-user access, staff-login regression, and rollback before enabling public signup. Never commit credentials or run schema changes on production without an approved backup.
