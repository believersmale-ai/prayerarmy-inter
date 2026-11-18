# Academy admissions release checklist (feature disabled by default)

## Workflow
Visitor applies to a published course at `/academy/apply` → personal administrator reviews in `/academy/admin` → admission email with 72-hour, single-use activation link → applicant sets own password at `/academy/activate` → student signs in at `/academy/login/student` → approved course enrollment.

No plaintext passwords are emailed or logged. Application records contain personal information and must not be exposed publicly.

## Required migration and configuration
1. Back up database and test `migrations/010_academy_admissions.sql` in staging, after identity and Academy foundation migrations.
2. Verify `public_accounts`, `public_account_roles`, `academy_courses`, `academy_enrollments`, `membership_configuration` exist.
3. Configure `PAI_PUBLIC_BASE_URL=https://prayerarmyinternational.com`, `PAI_SMTP_HOST`, `PAI_SMTP_PORT`, `PAI_SMTP_USER`, `PAI_SMTP_PASS`, `PAI_MAIL_FROM`. Test outgoing SMTP.
4. Set `PAI_PUBLIC_ACCOUNTS_ENABLED=true`, `PAI_ACADEMY_STUDENTS_ENABLED=true`, `PAI_ACADEMY_PUBLIC_CATALOG_ENABLED=true` only when identity, course and login systems have passed QA.
5. Set `PAI_ACADEMY_ADMISSIONS_ENABLED=true` **last** after the complete flow has been tested. Default is off (404).

## Important operational limits
- Existing public accounts are deliberately not automatically linked by email. Administrator admission returns a conflict for those applications; account linking needs a separate verified workflow.
- There is currently no automated reminder/resend for expired invitations. Administrator support is required.
- The applicant must own and access the submitted email inbox. Admission email delivery is attempted before the decision transaction commits.
- Course application is distinct from enrollment; when admissions are enabled the student self-enroll endpoint is blocked.
- Do not enable admissions until the account activation and SMTP workflows are tested on staging.
- Check privacy policy and retention procedures for application personal data before launch.

## Tests
- Published vs draft courses, duplicate applications, rate limiting and input validation.
- Unauthorized admin access, cross-origin requests, concurrent decisions, SMTP failure rollback.
- One-time invitation redemption, expired token, wrong token, password length, duplicate account.
- Activation creates a student role and only the admitted course enrollment.
- Student login succeeds after activation and denied applicants cannot log in.
- Verify mobile application/activation forms and accessibility.
- Check database indexes, backup and migration rollback plan.
