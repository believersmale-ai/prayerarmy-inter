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

## Shared account email verification configuration (staging only)
The SQL migration must be applied to the existing staging database before enabling these endpoints. The developer has not verified the remote database state.

Set the following Hostinger staging environment variables (never commit values):
```env
PAI_PUBLIC_ACCOUNTS_ENABLED=true
PAI_PUBLIC_REGISTRATION_ENABLED=true
PAI_PUBLIC_BASE_URL=https://staging.prayerarmyinternational.com
PAI_SMTP_HOST=<your SMTP host>
PAI_SMTP_PORT=587
PAI_SMTP_USER=<SMTP username>
PAI_SMTP_PASS=<SMTP password>
PAI_MAIL_FROM=<verified sender email>
```
Install Node dependencies during deployment (`npm install`). Do not enable registration until a real SMTP sender is configured and verified. If SMTP settings are missing, registration responds 503. The public auth API responds 404 when `PAI_PUBLIC_ACCOUNTS_ENABLED` is not true.

Endpoints: `POST /api/public/register` (displayName,email,password), `GET /api/public/verify-email?token=...`, `POST /api/public/login` (email,password), `GET /api/public/me`, `POST /api/public/logout`. Login and logout require same-origin browser requests; login requires verified active accounts. Email verification tokens are single-use and expire after 24 hours. Registration is not currently exposed through a public website form.

**Security and rollout:** Test with disposable staging accounts; do not enable on production. SMTP delivery and real MySQL migration have not been verified by the developer. Account recovery, resend verification, admin approval, member profiles, and attendance remain pending.

## Membership registration and approval (next staging milestone)
Apply `migrations/002_membership_configuration.sql` to the **same staging MySQL database** if not already applied. It defaults to manual approval **with** email verification. No database changes are performed automatically by Node.

When no email service exists, sign into the existing admin portal, choose **Manual — administrator approval**, uncheck **Require email verification**, and save. This is a deliberate temporary staging policy: administrators must validate applicant identities independently. The email address remains **unverified** in the database.

After deploying the branch and installing dependencies, enable `PAI_PUBLIC_ACCOUNTS_ENABLED=true` and `PAI_PUBLIC_REGISTRATION_ENABLED=true` in **staging only**. Registration is at `/member-register.html`. New accounts start `pending`; the admin portal lists pending member applications and allows approve/reject. Login succeeds only for active accounts under the configured verification policy.

Do **not** enable automatic approval without an operational SMTP sender and email verification. Never use production data in testing. Existing staff administration is unchanged. Registration currently collects name, email and password only; phone/branch, password reset, profile editing and attendance are future milestones. Password recovery is unavailable until configured; inform testers before enabling signup.

QA checklist: migration 002 present; staff admin login still works; manual mode saved; registration disabled by default; duplicate registration doesn't reveal existence; unapproved account cannot log in; approve then login; rejected account cannot log in; cross-origin approval denied; no password hashes returned by admin APIs; regression of existing site and forms.
