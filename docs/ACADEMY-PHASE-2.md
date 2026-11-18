# Phase 2 — Academy foundation (staging branch)

This branch starts the Academy from the agreed phased plan. It does **not** deploy the Academy or enable student examinations.

## Delivered in this increment
- `migrations/006_academy_foundation.sql`: courses, lessons, student enrollments, assignments/exams, questions/options, timed attempts, answer grading, certificate verification tokens.
- Existing `public_accounts` are reused for students; staff `admin_users` remains separate.
- Assessments default to `draft`, lessons default to unpublished and courses default to draft.
- The schema stores server-side start/deadline timestamps and result release policy. **The schema alone does not enforce these policies**: authenticated API guards, database transactions and tests are required before activation.
- No live database migration has been executed.

## Course management implementation (this branch)
- `academy-staff.js` exposes authenticated, owner-only course listing/creation/editing and draft lesson listing/creation. Course and lesson creation cannot publish content.
- `academy-admin.html` provides a responsive draft course/lesson editor at `/academy/admin`; the HTML route requires staff security permission.
- Set `PAI_ACADEMY_STAFF_ENABLED=true` **only on staging after migration 006** to activate these APIs. The default is disabled. No student exam routes are enabled.
- This is an initial admin workflow, not the complete Academy: course publishing, lesson editing, enrollment, exams, grading and certificates remain pending.
- Staging browser/database integration tests have not yet been run.

## Student enrollment implementation (this branch)
- `academy-student.js` implements published course catalog, member/student enrollment, personal enrollment list and enrolled-only published lessons.
- `academy.html` provides the responsive `/academy` student portal.
- Student APIs are mounted at `/api/public/academy` and reuse the existing public session; no new passwords or independent login.
- The public account feature must be enabled (`PAI_PUBLIC_ACCOUNTS_ENABLED=true`), and student routes separately require `PAI_ACADEMY_STUDENTS_ENABLED=true`. Keep both disabled until staging QA.
- Student access requires an active public account with a member or student role. Enrollment only permits `published` courses; course publishing is not yet implemented by the staff UI.
- The student page renders lesson content as plain text to avoid injecting stored HTML. Rich lesson formatting needs a separately reviewed sanitizer.
- The migration has **not** been executed; no live database, browser or CI result is claimed.
## Student enrollment (merged into main)
- `academy-student.js` provides published-course listing, enrollment, personal courses and published lesson access for enrolled accounts.
- `academy.html` serves `/academy`; the API is `/api/public/academy` and reuses the public-account session.
- Disabled by default: `PAI_ACADEMY_STUDENTS_ENABLED` must explicitly be `true`, and the existing public-account gate must be enabled.
- Migration 006 and the `academy_enrollments` table must be verified in the **actual production database** before enabling; creating a table in a different database does not apply it to production.
- No live migration, deployment or end-to-end test has been performed by this commit. Course publishing and exams are not yet implemented.

## Mandatory next implementation steps
1. Staging DB backup, apply migration 006 once to staging only and inspect foreign keys.
2. Finish staff course/lesson/assessment CRUD with audit logs, role checks and explicit admin activation.
3. Test student enrollment and lesson access against verified, approved, active public accounts; decide whether student-only roles are required instead of member-or-student.
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
