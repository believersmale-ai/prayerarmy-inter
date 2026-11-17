# Church management — members, households and attendance

This is the first church-management release, following the requested priority of **members, households and attendance**. It adds the private staff workspace at **`/church`** to the existing Node 22+/MySQL application. The public website, current media/editor improvements and separate PHP deployment remain in place.

## What staff can do

- Search, filter, create and edit member/visitor records, contact details, optional birth dates and join dates.
- Organize people into households, record relationships and select a primary contact from that household.
- Archive and restore members and empty households while retaining their history.
- Preview/validate/import CSV member lists in batches of up to 500 rows, with duplicate detection and retry protection. Export a filtered directory as CSV.
- Optionally link a directory record to an already-active registered member account with the same email. Linking does not create, approve, promote or disable public accounts.
- Create service sessions and open a register. First opening snapshots current non-archived, non-inactive directory records. Registrars can refresh an open roster to include newly added people.
- Record present, late, excused, absent or unmarked attendance; save a page of changes together; correct marks after explicitly reopening a closed register.
- Add unnamed guest totals separately from named attendance.
- Review per-member recent attendance, session totals, date-range reports and staff activity. Download reports as CSV or use the print layout.

The system does not infer official membership, mark unrecorded people absent, or send member messages automatically. Staff choose membership status and attendance marks. Registrars can correct records without losing history.

## Access

Sign in at `/church` with an existing personal **staff** account. The website manager at `/admin` uses the same staff session and provides a Church Management link to authorized users. System admins assign roles through **Team & Accounts**.

| Role | Directory and households | Attendance register | Create/open/close sessions | Reports/activity |
| --- | --- | --- | --- | --- |
| System admin | Yes | Yes | Yes | Yes |
| Church registrar | Yes | Yes | Yes | Yes |
| Attendance usher | No contact details or exports | Names/households and marks only | No | No directory activity or reports |
| Existing editor/media/pastoral-care roles | Existing permissions retained | No new access | No new access | Existing permissions retained |

An usher's roster response excludes member emails, phone numbers, birth dates and account links. Private endpoints check staff permissions on every request; hiding a navigation item is not the access control. Logout clears the displayed records and dialogs. Personal staff accounts identify activity; a legacy shared-passkey session is labeled as such.

## Data and rules

`migrations/006_church_management.sql` creates only new `church_*` tables. It runs idempotently during Node initialization before readiness is reported. It does not rename, drop or rewrite existing site, media, staff or public-account tables. Fresh-database initialization also creates the existing media-caption table, which the media-delete workflow requires. Test the branch against staging and back up the intended database before production rollout.

- `church_members`, `church_households`: member and household records, soft archives and optimistic record versions.
- `church_sessions`, `church_roster`, `church_attendance`: UTC service times, opening-time roster snapshots and one attendance record per person/session.
- `church_activity`: actor, record, action, changed field names/statuses and time. It does not copy passwords, birth dates, addresses or full member profiles into the audit payload.
- `church_import_batches`: content hash, actor and count for idempotent import retries.

The staff workspace shows service times in the browser's local timezone and labels that timezone. Date-only birth/join fields remain date-only. Report date ranges are converted from local calendar boundaries to UTC before querying. The API requires an explicit offset or `Z` when scheduling a service.

Closed and cancelled registers reject attendance writes. Historical records remain in reports when a person is archived. Cancelled sessions stay in history but are excluded from attendance totals. Unmarked and absent records are reported separately. Reports require a narrower date range if it contains more than 5,000 sessions, rather than silently truncating totals. Attendance totals count present + late + unnamed guests across sessions; these are attendances, not a unique-person headcount.

Stale member/household/session edits return 409 rather than overwriting another staff member's work. Attendance batches are transactional: a conflict rolls back the batch. Repeating an identical check-in or committed import does not duplicate counts or people. CSV exports quote fields and guard spreadsheet formula prefixes.

Archiving a person clears their primary-contact designation; moving a primary contact to another household does the same. A household with current member records cannot be archived until those records are moved or archived. An archived household must be restored before restoring a person still assigned to it.

## Using the workspace

1. Sign in as a system admin and assign **Church registrar** or **Attendance usher** roles as needed.
2. Open `/church` and add households and people. Existing member lists can use the downloadable CSV template; preview errors must be resolved before import.
3. Create a service with local start/end times, open its register and review the roster.
4. Mark attendance, save the changes and enter unnamed guest totals through session details. Close the register when complete.
5. Open Reports to select a date range and export or print the results. Review Activity for changes, imports and exports.

The workspace starts empty. No demonstration member records are seeded into the application.

## Verification

Use a disposable MySQL/MariaDB server; the integration suites create uniquely named temporary databases and remove them afterward. Configure `PAI_TEST_DB_HOST`, `PAI_TEST_DB_PORT`, `PAI_TEST_DB_USER` and `PAI_TEST_DB_PASSWORD` for that test server.

```sh
pnpm test
pnpm run test:church
pnpm exec playwright install chromium
pnpm run test:church:browser
pnpm run test:database
```

For an existing Chromium installation, set `CHROMIUM_EXECUTABLE_PATH` when running the browser suite. No live church records, production credentials or external email delivery are used by the church-management tests.

The API suite checks role boundaries, date validation, household invariants, version conflicts, concurrent check-ins, all-or-nothing batches, archive history, CSV safety, atomic duplicate imports, account-link protection, reports and persistence after restart.

The browser suite creates and edits real test records through the UI, assigns a household primary contact, validates/imports a CSV, checks escaped markup, schedules in a non-UTC timezone, records and locks attendance, exports a report, archives/restores a member, checks all major views at 390/768/1440px and verifies logout clearing and usher privacy.

## Next releases toward the full church-management system

The requested first-priority foundation is covered here. Follow-on modules are separate work: ministries/small groups and volunteer scheduling; pastoral-care cases; giving/funds/pledges/expenses and financial permissions; member self-service and agreed check-in policies; communications and consent preferences; academy/blog integration and organization-specific fields. Financial rules, membership criteria, messaging consent and retention policies should come from the church rather than be inferred by the software.

This branch is code for review and staging validation. No production database migration or hosting deployment was performed while building this release.
