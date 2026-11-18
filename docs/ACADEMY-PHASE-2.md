# Phase 2 — Academy foundation (staging branch)

This branch starts the Academy from the agreed phased plan. It does **not** deploy the Academy or enable student examinations.

## Delivered in this increment
- `migrations/006_academy_foundation.sql`: courses, lessons, student enrollments, assignments/exams, questions/options, timed attempts, answer grading, certificate verification tokens.
- Existing `public_accounts` are reused for students; staff `admin_users` remains separate.
- Assessments default to `draft`, lessons default to unpublished and courses default to draft.
- The schema stores server-side start/deadline timestamps and result release policy. **The schema alone does not enforce these policies**: authenticated API guards, database transactions and tests are required before activation.
- No live database migration has been executed.

## Mandatory next implementation steps
1. Staging DB backup, apply migration 006 once to staging only and inspect foreign keys.
2. Staff-only course/lesson/assessment CRUD with server-side role checks and audit logs; explicit admin activation.
3. Student enrollment and lesson access restricted to verified, approved, active student accounts.
4. Timed assessment engine: use database/server time; enforce opens/closes, duration and max attempts on *every* request and submission; immutable questions after activation; transaction/locking to prevent double attempts.
5. Grade objective questions on submission; hold essay marks for staff review; release results only according to `result_policy`. Do not leak correct answers before release.
6. Generate and verify certificates only after verified course completion; revocation and public verification must not disclose student private data.
7. Build responsive Academy UI and end-to-end tests for admin, student, timing, replays, expiration, offline/reconnect, grading and certificate verification.
8. Only then approve production deployment and migration.

## Audit findings addressed
- `main` fix `76e4f9a` removes duplicate hidden-assets routes. Previously the first route could bypass bundled-file checks and official-logo protection.
- Current public-site and admin workflows have not been browser-tested against live Hostinger; repository source review cannot establish live DB health or deployment.
- `admin-quick-edit.js` delegates publishing to the existing Save Changes button. Verify successful persistence, revision conflict handling and public refresh end to end.
- Media uploads require durable `PAI_DATA_DIR` and the configured storage to survive redeployments.
- Verify existing migrations 001–005 in the correct database before applying 006; do not re-run destructive scripts.

## Test commands
```sh
npm ci
npm test
npm run test:database
npm run test:church
npm run test:church:browser
```
Use disposable MySQL fixtures; do not point tests at production. No test result is claimed here.
