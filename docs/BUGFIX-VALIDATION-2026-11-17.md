# Bug fixes and validation — 17 November 2026

> Historical first-pass report. The Node gaps below have since been implemented; see [NODE-BACKEND-COMPLETION.md](NODE-BACKEND-COMPLETION.md) for the current status.

These changes target `audit/hostinger-production-readiness`. All database mutations and browser checks described below used isolated local test databases. No production deployment, database migration, or hosting configuration change was performed.

## Fixed behavior

- PHP page generation is now loaded and dispatched. About/contact/legal pages, Markdown, robots, sitemap, server card, MCP and branded 404 responses reach their intended handlers. The duplicate sitemap function was removed.
- Required API rewrite, PHP upload-size settings and upload-directory protection files are restored. API implementation/schema files and development directories are blocked under Apache.
- Legal pages no longer loop between `/privacy` and `/privacy/` (likewise terms). Admin aliases redirect trailing slashes to preserve relative asset URLs.
- Node serves the page scripts and styles omitted from its static allowlist. Missing pages return 404 instead of a misleading homepage response.
- Both hosts expose `/api/runtime`; admin login identifies the backend independently of database health. Node shared-passkey login now uses the Node endpoint.
- Node public prayer/contact forms now receive and validate the signed tokens their frontend requires. Honeypots are checked server-side.
- Node private prayer/contact lists, read/contacted flags, deletion, and prayer follow-up controls use the existing Node submission tables. Follow-up columns and the settings store are created additively at startup.
- Node settings save replies acknowledge exactly the revision written, avoiding a race where another editor's later revision could be returned. The unsaved-edits indicator retains edits made during a save.
- Node admin sessions retain the identity of the user who actually signed in. Cookie sign-in/sign-out/passkey endpoints reject requests without a matching Origin.
- Node approved testimonies respect `show_name` when the column exists; without evidence of consent, names are rendered as Anonymous.
- PHP media listing requires the media permission, and its admin caller refreshes and supplies its token. Password changes revoke the other sessions for the account.
- Duplicate concurrent prayer-wall votes increment the PHP counter only when the vote insert succeeds.
- Search excludes future announcements and keeps date-only announcements visible through their expiry day.
- Token refresh changes credential properties only, preserving matching strings inside content being saved. Toast/hero button text is escaped, and link handling rejects control-character scheme bypasses.
- Malformed MCP requests return protocol errors instead of PHP type errors. The homepage loads the WebMCP script.
- Membership controls load after authentication and stay disabled on PHP hosts where those Node endpoints do not exist. Manual-approval email verification accurately reports pending approval.
- Admin search/quick actions respect role visibility. The compact drawer extends to tablets, fixing header/navigation overflow; save-state and action controls remain within their containers.
- The pnpm lockfile now includes the existing nodemailer dependency.

## Reproducible checks

- `npm test`: six Node routing/security groups, plus an optional Apache/PHP group when `PHP_TEST_URL` points to a local test deployment. The Node routing fixture deliberately uses an unavailable database and no real credentials.
- `npm run test:database`: Node/MySQL integration checks. Configure `PAI_TEST_DB_HOST`, `PAI_TEST_DB_PORT`, `PAI_TEST_DB_USER`, `PAI_TEST_DB_PASSWORD` for a disposable test server. This command creates a unique `pai_regression_*` database and removes it afterward. It checks login/session identity, settings revision conflicts, prayer/contact submissions, private follow-up, anonymous approved testimonies, membership approval and settings persistence after restarting Node.
- PHP lint on every `api/*.php`; JavaScript syntax checks on root scripts, tests and smoke scripts; `git diff --check`.

## Additional local checks actually run

Local environment: Node 24, PHP 8.4, MariaDB 11.8, Apache 2.4 and Chromium. PHP/Node databases were separate; production table contents and credentials were not accessed.

- All seven routing/security groups passed, including real Apache rewrite rules, legal routes, protected source files, Markdown negotiation and anonymous media rejection.
- PHP API: fresh setup, owner/editor/media/care authorization, dashboard per role, prayer/contact/comment/testimony/wall submissions, anonymous approved testimony, six concurrent duplicate votes through Apache, scheduled/expiring announcement search and MCP initialize.
- Node database integration passed, including a restart followed by a persisted settings read.
- Chromium: PHP owner (24 tabs), editor (19), media (4), care (6), and homepage. No JavaScript or same-origin HTTP errors during the tested tab navigation. Responsive layout was checked at 390, 768 and 1440 pixels.

## Remaining integration work and limits

This is not a claim that every possible bug is fixed. The repository contains two different backend schemas. The README's historical PHP hosting claim and the November 16 Node deployment audit conflict; the current live hosting configuration was not available to verify.

The Node host still lacks several PHP-backed modules: sermon editing, public comments, testimony submission/moderation, prayer-wall submission/voting, podcast generation, search/agent pages, analytics, notifications and staff-team management. Public sermon/testimony/wall reads already target existing `site_content_*` tables; their production schema must be inspected before adding write handlers or migrations. Those modules were not replaced with guessed tables or empty success responses. Unsupported Node content actions return an explicit unimplemented-feature response.

Node admin sessions remain in memory and expire on restart. Existing Node/ PHP data layouts should be reconciled explicitly before switching a deployed site between them. SMTP delivery, actual livestream providers, payment links, large uploads and the live Hostinger deployment have not been validated in this pass.
