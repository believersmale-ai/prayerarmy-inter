# Scheduled member check-in and staff portals

This release adds the member portal at `/member` and an opt-in check-in window for each service. It uses the existing Node 22+/MySQL application, public member accounts and separate staff permissions. It does not enable public registration, change approval policy or deploy/migrate a live installation automatically.

## Prepare a member account

1. A system admin reviews pending member applications in **Website manager → Team & Accounts**. The existing membership approval and email-verification rules still apply.
2. A registrar opens the person's directory record in `/church`, records the same email as their active member account, and chooses **Link account**. Linking does not create, approve or promote an account.
3. Give the member `/member`, also available from **Members** in the website navigation and **Member portal** in its footer. They sign in with their member email/password. Staff cookies and member cookies are separate; a staff sign-in is not a member check-in identity.

An account without a current linked directory record sees an explanation and no service/member data. Archived or inactive records cannot self-check in. A visitor directory status does not itself deny check-in when an approved member account has explicitly been linked; this feature does not redefine official membership criteria.

Members can request an account through the existing registration page if registration is open. They should ask a registrar for account or sign-in help. An usher can always use the existing staff register for someone who cannot use member check-in. Household-wide or proxy check-in is not provided.

## Schedule and display check-in

1. Create a service in **Attendance** with its location and local start/end times.
2. Open its register view and choose **Member check-in**. Set Enabled, choose the opening/closing times and save. A new form starts with a window from 30 minutes before the service until its end. The window can last up to 24 hours, open within 24 hours before the service, and must close by the service's end.
3. Copy the newly generated eight-character code or choose **Print sign**. The sign includes the service name, portal link and instructions. The raw code is shown in the issuing dialog only; staff can generate a replacement if it is lost. Saving enabled settings rotates the code and invalidates the previous one.
4. Display the code at the service and share the member portal link. The link includes the session ID for prioritizing that service; it contains no access code or account token.

A scheduled register stays scheduled until staff open it or the first eligible member successfully checks in during the enabled window. That first check-in opens it transactionally and snapshots active directory records. A member who has since been added and linked can join that register on their own successful check-in without replacing its existing roster. Staff can still open a register and record marks manually.

Changing a service's start/end time automatically disables member check-in, so a stale window cannot remain active after rescheduling. Review and re-enable its check-in settings afterward. Changing only its title/location/guest total preserves the configured window. Closing or cancelling a service blocks self-check-in immediately. Reopening permits it only if the configuration remains enabled and the server is within the configured window.

## Member arrival

1. Sign in at `/member` and select the service. Future check-in windows are visible but disabled. The page enables a service automatically at its opening time, using server time rather than trusting the device's clock. It refreshes at the closing boundary too.
2. Enter the current eight-character code displayed at the service and choose **Check me in**.
3. Wait for **You're checked in** and the recorded time. A repeated tap does not create another attendance record. The member can see their own recent attendance, with up to 25 entries.

Self-check-in records **Present**. It does not infer the church's lateness policy; staff can mark Late or make other corrections. Existing Present/Late marks are preserved and return a confirmation. Explicit Absent/Excused staff marks require an usher's review and are not overwritten by self-check-in. Staff see the check-in source in the roster and an identified member check-in activity event. Refresh the workspace to pick up a register that another person opened or changed; optimistic version checks protect concurrent staff edits.

The on-site code is an arrival aid, not proof of physical location. Treat it as a code for the service, and ask an usher to help when needed. No GPS, household directory, other members' contact details, automatic messages or tracking pixels are involved.

## Access and data protections

- All member APIs live under `/api/public/church`, inside the existing public-account feature gate, HttpOnly cookie scope, same-origin protection, active-account/email-verification checks and member-role authorization.
- The server binds the member record to the authenticated account. A caller cannot select another member by sending a member ID.
- Attendance and receipt writes share the staff register's session/member locks and unique roster/attendance keys. Member self-check-in and staff marking therefore serialize correctly. These SQL-only attendance transactions retry bounded database deadlock rollbacks safely.
- Staff configuration endpoints require `attendance_manage`; ushers, editors, media and pastoral-care roles cannot issue codes or change windows.
- Codes are generated randomly and only a SHA-256 hash is stored. Raw codes are not in audit payloads or member listing responses. Twelve check-in attempts per account per 15-minute bucket are allowed; counters commit even for failed codes and survive server restarts. A rejection returns 429 and a Retry-After header.
- Public login has independent identity and venue-IP buckets, so 20 unrelated people sharing a venue IP do not exhaust a single 20-person limit. Login remains rate limited.
- Member responses, shells and staff APIs use no-store, and private shells are marked noindex. Logout clears visible private records. Codes are not stored in localStorage or sessionStorage.

`migrations/009_church_member_checkin.sql` adds `church_checkin_settings`, `church_self_checkins` and `church_checkin_limits`. It initializes idempotently after migration 008. It does not drop, rename or rewrite prior attendance. New public-account tables still initialize through the existing feature-gated identity migrations. Validate on staging and back up the intended database before production rollout.

## Staff portal improvements

Both staff workspaces now share a tool finder (**Ctrl/⌘ K**), permission-filtered navigation, a portal switcher, skip-to-content links, keyboard-accessible dialogs, offline feedback and touch-friendly controls. The church workspace has a **Refresh workspace** action that respects unsaved attendance/form changes. The website manager reuses an existing Node staff cookie when arriving from the church workspace, rather than requesting another sign-in. Role checks stay on the server.

The release also fixes delayed register replies overwriting a different view, delayed search callbacks touching removed fields, late form/import replies reopening or changing a closed dialog, and invalid rolled-over calendar dates being accepted as schedule times. Date/time forms preserve seconds, so editing only guest totals does not silently reschedule a service or disable check-in. The main church workspace aligns at the top rather than vertically centering short screens. Existing public content and media workflows remain covered by regression checks.

## Hosting and preview distinction

Functional check-in requires the configured **Node/MySQL host** with public accounts enabled (`PAI_PUBLIC_ACCOUNTS_ENABLED=true`). Keep the existing registration and approval settings deliberate; this release does not toggle those deployment settings. HTTPS/proxy settings and the existing public-account verification configuration remain required for production use.

Vercel is configured here as a **static preview**, not a Node/MySQL deployment. `scripts/build-static-preview.mjs` copies the server's public-file allowlist, the two portal shells and public media into `.vercel-static`. Backend JavaScript, PHP configuration, migrations, tests, environment files, node_modules and uploaded private data are excluded. Portal preview URLs render their shells, and the member portal clearly reports when the API is unavailable. A successful static preview does not prove the live backend or database is deployed. The Apache member route also serves this shell so the public navigation can explain unavailable check-in rather than returning a missing-page error; the check-in API itself remains Node-only.

## Verification

`pnpm run test:church` includes the member API integration helper, covering account/role isolation, invalid dates/windows/codes, code rotation, concurrent duplicate taps, staff marks, archival/suspension, rescheduling, closing, per-account rate limits and restart persistence.

`pnpm run test:church:browser` includes the member browser helper. It approves an account through the website manager, links it through the church directory, configures windows/codes, signs in as a member in a separate browser context, waits for a window to open automatically, checks in, verifies the staff source and confirmation, tests logout clearing, keyboard tools, offline feedback and mobile/tablet/desktop layouts. It also exercises delayed register/member-save replies and search callbacks after navigation.

`pnpm test` covers public-only Vercel output, portal routes/assets and private API boundaries, alongside existing routing checks. `pnpm run test:database` covers the existing application workflows. All integration databases and accounts are disposable fixtures; no live member data or production migrations are used.
