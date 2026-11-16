# Hostinger production-readiness audit (2026-11-16)

## Verified deployment baseline
- Repository: believersmale-ai/prayerarmy-inter
- Production source checkout: df359160d22fa5ef1634500a92dd0765cf70fd18
- Hostinger app: Node.js 22 / pnpm / server.js, deployed under hbuilds/current/nodejs
- Live HTTP checks supplied by operator: / -> 200; /api/health/db -> 200 with {"success":true,"database":true}; /api/settings -> 200; /api/index.php -> 404; /podcast.xml -> 404.
- Startup log reports database tables ready; stderr.log was empty at time checked.
- These checks do NOT verify data persistence, admin authorization, all endpoints, or a successful rollback.

## Confirmed code findings
1. **Split backend / missing routes (high).** server.js explicitly documents that sermon archives, comments, testimonies, prayer wall, podcast feed and team accounts rely on a PHP API. Node's /api fallback returns 404 for unsupported routes. The Hostinger Node deployment does not execute PHP from the app directory.
2. **Frontend/backend contract mismatch (high).** script.js requests /rest/v1/messages, message_comments, testimonies, wall_prayers and increment_prayed, while Node implements only POST /api/rest/v1/prayer_requests and connect_requests plus its own admin routes. Review the frontend SUPABASE_URL/EDGE_BASE configuration before choosing migration or compatibility routing.
3. **Settings durability (high).** server.js writes site-settings.json inside the deployed app directory. Hostinger's versioned builds can replace that directory. Move mutable settings to durable storage with atomic updates and safe migration.
4. **Uploads durability (high).** multer writes to assets/uploads inside the deployed app directory. Move uploaded media to a durable shared location or object storage; maintain existing public URLs and back up existing media before cutover.
5. **Admin frontend mismatch (high).** admin.js uses auth/v1/token and multiple EDGE_BASE functions, while Node implements /api/admin/login, /api/settings, /api/upload, /api/media and /api/admin/submissions. Audit all admin flows against actual routes; do not assume a working login because the DB health endpoint succeeds.
6. **Podcast (medium).** script.js and admin.js advertise /podcast.xml, but server.js does not define it and live response is 404. Implement only with a verified canonical sermon/audio data source.
7. **Session persistence (medium).** ADMIN_SESSIONS is an in-memory Map; sessions expire on restart and cannot be shared across processes. Consider a database-backed session store with secure cookies, CSRF protection and role checks.
8. **Secrets and deployment safety (high).** api/config.php contains placeholder credentials and setup instructions. Do not publish or execute setup.php on production. Review all public static routes and ensure no credentials or backups are exposed.
9. **Migration discipline (high).** Database and media backups, schema migrations, staging smoke tests and rollback must precede deployment.

## Execution order
- Phase 0: backup DB, media, current build and configuration; verify recovery path; inventory routes and tables without copying secrets.
- Phase 1: add automated tests for API compatibility, auth and settings persistence; implement missing backend routes on a staging branch with minimal frontend changes.
- Phase 2: move mutable data to durable storage, migrate and verify existing records/media.
- Phase 3: validate sermons, prayer wall, testimonies, comments, podcasts and all admin roles end-to-end.
- Phase 4: deploy through Hostinger's existing GitHub integration with an approved rollback plan; monitor error logs and user flows.
- Phase 5: design academy, timed exams, self-attendance, certification and blog as separate modules after the foundation is stable.

## Safety constraints
Do not edit hbuilds/current directly, overwrite public_html/.htaccess, run setup.php, expose environment variables, or force-push main. Existing /blog must be preserved. All functional changes require staging verification and explicit production approval.
