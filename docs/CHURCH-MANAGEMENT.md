# Church management — people, groups, volunteers and attendance

The church-management workspace includes **members, households, ministries/small groups, volunteer scheduling and attendance**. It adds the private staff workspace at **`/church`** to the existing Node 22+/MySQL application. The public website, current media/editor improvements and separate PHP deployment remain in place.

## What staff can do

- Search, filter, create and edit member/visitor records, contact details, optional birth dates and join dates.
- Organize people into households, record relationships and select a primary contact from that household.
- Archive and restore members and empty households while retaining their history.
- Create ministries and small groups, record meeting details, assign member/leader roles and maintain group rosters.
- Schedule group volunteer shifts, set capacities, assign eligible people, record confirmations and service outcomes, and export shift rosters.
- Preview/validate/import CSV member lists in batches of up to 500 rows, with duplicate detection and retry protection. Export a filtered directory as CSV.
- Optionally link a directory record to an already-active registered member account with the same email. Linking does not create, approve, promote or disable public accounts.
- Offer scheduled member self-check-in through `/member`, with approved/linked accounts and staff-issued arrival codes. See [member check-in and portal operations](MEMBER-CHECKIN.md).
- Create service sessions and open a register. First opening snapshots current non-archived, non-inactive directory records. Registrars can refresh an open roster to include newly added people.
- Record present, late, excused, absent or unmarked attendance; save a page of changes together; correct marks after explicitly reopening a closed register.
- Add unnamed guest totals separately from named attendance.
- Review per-member recent attendance, session totals, date-range reports and staff activity. Download reports as CSV or use the print layout.

The system does not infer official membership, mark unrecorded people absent, or send member messages automatically. Staff choose membership status and attendance marks. Registrars can correct records without losing history.

## Access

Sign in at `/church` with an existing personal **staff** account. The website manager at `/admin` uses the same staff session and provides a Church Management link to authorized users. System admins assign roles through **Team & Accounts**.

| Role | Directory, households and groups | Attendance register | Create/open/close sessions | Reports/activity |
| --- | --- | --- | --- | --- |
| System admin | Yes | Yes | Yes | Yes |
| Church registrar | Yes | Yes | Yes | Yes |
| Attendance usher | No contact details or exports | Names/households and marks only | No | No directory activity or reports |
| Existing editor/media/pastoral-care roles | Existing permissions retained | No new access | No new access | Existing permissions retained |

An usher's roster response excludes member emails, phone numbers, birth dates and account links. Private endpoints check staff permissions on every request; hiding a navigation item is not the access control. Logout clears the displayed records and dialogs. Personal staff accounts identify activity; a legacy shared-passkey session is labeled as such.

## Ministries and small groups

Open **Groups** in the sidebar as a system admin or registrar. Add a ministry or small group with a name, description, location and meeting details. Open its roster and choose **Add person** to search the existing directory; refine the search if more than 100 people match. Assign the person as a member or leader. One person can belong to several groups, and each group can have several leaders. Leader designations do not create staff accounts or grant system permissions.

Use the roster to change roles or remove people. Removed assignments are retained in storage and changes are recorded in Activity. Re-adding someone restores the assignment without creating a duplicate. Archiving a group locks its details and roster until restored. Archived directory members stay visible on their group rosters, but new assignments and role changes require restoring their member record. The group list counts current roster members whose directory records are not archived; the detailed roster also shows archived people. Inactive directory members can participate; group membership does not change their official membership status.

Group lists and rosters are paginated. Search and filter the group list by name, type and archive status. Group edits and roster changes share an optimistic version; concurrent changes return 409 and require reopening the group before retrying. No group messages, recurring events or attendance sessions are created automatically. Meeting details are descriptive text, not a scheduling engine.

`migrations/007_church_groups.sql` adds `church_groups` and `church_group_members`, with foreign keys to the directory. It runs idempotently after migration 006 during Node startup. Existing church records are retained; no production migration was performed while implementing this feature. Ushers and existing editor/media/pastoral-care roles have no new group access.

## Volunteer scheduling

Open **Volunteers** as a system admin or registrar. Create a shift for a current ministry or small group. Enter its title, volunteer role, location, instructions, local start/end times and capacity. A shift can last up to seven days and hold 1–500 people. Its group is fixed after creation; cancel it and create a new shift if it belongs elsewhere. Search current groups when creating a shift; the group picker loads up to 100 matches.

Choose **Assign person** to find people on that group's current roster. The candidate picker has search and pagination. Archived directory members and people already reserving a place on that shift are excluded. Inactive membership status does not by itself remove a person from a ministry or disqualify them from serving. New reservations require a current group-roster assignment and an unarchived person and group.

Staff record **Assigned**, **Confirmed**, **Declined**, **Served** or **No show** statuses. Confirmation is a staff record, not an automatic message or a response from a member portal. Assigned, confirmed, served and no-show records reserve places; declined and removed records release places. Those reserved records also prevent overlapping shifts, including completed historical shifts. Adjacent shifts where one ends exactly as the next starts are allowed. Service outcomes do not mark service attendance or change membership status.

Capacity and overlapping bookings are checked transactionally for assignments, time/capacity edits and reopening. Cross-group bookings for the same person are checked too. All scheduler writes use a database row lock so separate Node processes cannot accept competing bookings simultaneously. A stale shift version returns 409; reopen the shift to review the latest roster before retrying. Repeating an identical status with the current version does not duplicate the assignment or increment its version.

Complete a shift to lock its details and assignments. Staff can explicitly reopen a completed shift to correct it. Cancelling preserves assignments and releases their reservations. Reopening a cancelled shift rechecks every reserved assignment; it is rejected if someone has since been booked elsewhere. A completed/cancelled shift must be reopened before another state change. There is no hard-delete operation.

Archiving a group preserves its shifts. Staff can complete/cancel its scheduled shifts or decline/remove existing assignments; editing, reopening and creating reservations require restoring the group. Archiving a member preserves their assignments and displays an archive label; decline/remove their reservation if needed. Removing someone from a group roster does not silently cancel existing shifts. Their existing reserved assignment can still be updated, but a declined/removed reservation cannot be reactivated until they rejoin the group. No messages or reminder emails are sent by this module.

The schedule has search, state filters and optional date filters. Date filters select shift **start times** in the browser's timezone; choose both dates or leave both blank. The end date includes that entire local calendar day, and the requested interval must be at most 366 days. The list and shift rosters are paginated. Shift exports include UTC times, group, role, state, names, statuses and archived-member flags, with spreadsheet formula protection. They exclude member contact details and instructions. Exports and updates appear in Activity.

`migrations/008_church_volunteers.sql` adds `church_volunteer_shifts`, `church_volunteer_assignments` and the singleton `church_schedule_lock`. It initializes idempotently after migrations 006 and 007 during Node startup. Existing member, group and attendance records are preserved. The existing member-management permission gates every volunteer endpoint; ushers and editor/media/care roles gain no access. No new production migration or deployment was performed while implementing this feature.

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

The API suite also runs `tests/volunteers.integration.mjs`, checking shift validation, permissions, capacities, competing bookings across groups, time edits, cancellations/reopening, archived people/groups, exports and restart persistence. It checks group CRUD, concurrent roster changes, duplicate protection, archive/restore rules and restart persistence, plus role boundaries, date validation, household invariants, version conflicts, concurrent check-ins, all-or-nothing batches, archive history, CSV safety, atomic duplicate imports, account-link protection, reports and persistence after restart.

The browser suite also runs `tests/volunteers.browser.mjs`, exercising shift creation/editing, group-roster assignment, capacity and overlap errors, status changes, completion/cancellation/reopening, exports, date filters, timezone conversion and responsive views. It creates and edits groups, assigns leaders, changes/removes roster assignments, archives/restores groups, tests group filters and mobile layouts, and creates and edits real test records through the UI, assigns a household primary contact, validates/imports a CSV, checks escaped markup, schedules in a non-UTC timezone, records and locks attendance, exports a report, archives/restores a member, checks all major views at 390/768/1440px and verifies logout clearing and usher privacy.

## Next releases toward the full church-management system

The requested first-priority foundation is covered here. Follow-on modules are separate work: group-specific attendance; pastoral-care cases; giving/funds/pledges/expenses and financial permissions; expanded member self-service and agreed check-in policies; communications and consent preferences; academy/blog integration and organization-specific fields. Financial rules, membership criteria, messaging consent and retention policies should come from the church rather than be inferred by the software.

This branch is code for review and staging validation. No production database migration or hosting deployment was performed while building this release.
