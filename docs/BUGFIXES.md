# Bug-fix pass on the redesign package

Fixed in this pass (every item was reproduced or verified by test first):

1. **Lost security files restored** - `.htaccess`, `api/.htaccess`, `api/.user.ini`, `uploads/.htaccess` and `.gitignore` were missing from the redesign zip (hidden files are easy to drop when zipping). Without them: clean URLs and HTTPS redirect stopped, `api/schema.sql` was downloadable, and PHP could run from `uploads/`.
2. **`/terms` page** - had no clean URL and no link on the site. Added the rule and a footer link.
3. **Two different privacy/terms pages** - `privacy/index.html` and `terms/index.html` were different copies of `privacy.html` / `terms.html`, so the policy shown depended on the URL. The duplicate folders were removed; one source of truth remains.
4. **`package.json` vs `pnpm-lock.yaml`** - `mysql2` was added to package.json but not the lockfile, so `pnpm install --frozen-lockfile` failed. Lockfile regenerated.
5. **`server.js`** (Node host) - served the whole project folder, including `api/config.php` (database password) and `server.js`; default passkey `prayerarmy`; sessions never expired; the connect form always failed (it required a field the website never sends); the prayer form lost the contact details and the "confidential" flag; audio uploads were rejected; CSV export allowed spreadsheet-formula injection; the database being down stopped the whole site; startup could crash on MySQL. All fixed.
6. **`script.js`** - settings loading now starts after the whole script has loaded (it could crash the page if the settings request was skipped); two mangled comments tidied.

Verified: PHP API 126/126 checks, browser-level test of homepage + admin 37/37, Node server 74/74, `.htaccess` rules under real Apache.
