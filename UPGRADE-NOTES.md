# Prayer Army International: upgrade notes

Stack kept as-is: static HTML/CSS/JS + PHP/MySQL API on Hostinger. No new libraries, no build step.

## Deploying this upgrade over a live site
1. **Back up first** (hPanel Backups + phpMyAdmin export).
2. Upload everything in this folder, **keeping your existing `api/config.php`** (do not overwrite it) and your `uploads/` media. Turn on "Show hidden files": `.htaccess`, `api/.htaccess`, `api/.user.ini` and `uploads/.htaccess` are new and required.
3. Open the website once. The database upgrades itself automatically (adds tables/columns only; nothing is dropped or rewritten). Existing sermons, prayers, testimonies and accounts are untouched.
4. Replace `YOUR-DOMAIN.com` in `index.html` (og:url, og:image x2, canonical) and `robots.txt` (Sitemap line).
5. Sign in at `/admin`, check **Dashboard**, then **Notifications** (optional) and **Announcements**.
Fresh installs: follow HOSTINGER-DEPLOY.md (setup.php), unchanged.

## New features
- Admin **Dashboard** with real counts per role, recent activity, 14-day visit chart, livestream status.
- **Announcements** (publish, pin, schedule, auto-expire) shown on the home page.
- **Global search** (sermons, events, announcements, ministry info) via `/api/search`.
- **Sermon metadata**: speaker, category, custom thumbnail, featured flag, category filter chips, edit dialog.
- **Next-broadcast countdown** and official-platform links in the Live section (never claims "live" unless the admin switches it on).
- Event **venue** and **published** switch; **past event highlights**; "Plan a Visit" hero button.
- **Prayer follow-up** tracking (status + private note); search/filter on requests, testimonies, wall.
- Edit testimonies and wall posts; testimony **name permission** (anonymous unless the person agrees).
- Visitor form: first-time visitor / call-back / question options.
- **Notifications**: optional e-mail alerts (never include private prayer text; address never published).
- **SEO**: canonical, sitemap.xml, robots.txt Sitemap, page title/description/sharing image fields.
- Analytics: 7/30/90-day range, popular pages.
- Mobile admin: slide-in menu, no horizontal overflow.

## Improvements to existing features
- Server-side spam protection: signed form tokens (2 s to 4 h old) + honeypot enforced on the server (previously the honeypot was only checked in the browser).
- "I prayed" counts one per person per request (device id + per-address daily cap); the server's count is shown.
- Prayer form: inline validation, loading state, privacy choice, offline message.
- Missing `.htaccess` files added (HTTPS, API routing, security headers, no code execution in `uploads/`, developer files blocked).
- Notification address and any passkey field are stripped from the public settings endpoint.
- Frosted-glass blur effects removed; touch targets 44px; fixed "View Event" pointing at the prayer form.

## Admin login/session fixes (second pass)
- A temporary network/server failure at start-up no longer signs you out; it shows a message and a reload recovers.
- Shared-passkey sessions now sign out cleanly on a 401 instead of failing silently.
- Two tabs refreshing at once no longer log one tab out (single-use refresh tokens are adopted across tabs).
- Signing out clears the previous person's lists and dashboard; the next sign-in (even a different role) starts on the Dashboard with fresh data.
- Login errors are announced to screen readers.
- Tested: wrong password, unknown user, upper-case e-mail, reload, silent token refresh, dead session, role switch in one tab, token rejected after logout (401), server offline then recovered, brute-force lockout, every admin tab (no console/HTTP errors), settings save round-trip.

## Tests actually run (local PHP 8.3 + MariaDB 10.11, Chromium)
- PHP lint on all API files; JS syntax check on all scripts.
- API: role permissions for owner/editor/media/care (403s verified), unauthenticated 401, token/honeypot/forged-token rejection, prayer dedupe, anonymous testimony hidden until approved, private requests not publicly readable, search, sitemap, follow-up, dashboard per role.
- Migration: old-schema database with data upgraded without loss, run twice; fresh install through setup.php.
- Browser: home page (desktop + phone) with no console errors or overflow; prayer/testimony/connect submissions; search; filters; wall; mobile menu; admin login per role, tab visibility per role, announcement save, sermon create/edit, notifications, analytics range, mobile admin overflow on 9 views.

## NOT tested (be honest)
- Apache rules (`.htaccess`) and Hostinger `mail()` delivery: tested only by reading; verify on the server (open `/admin`, `/sitemap.xml`, `/podcast.xml`, `/uploads/` listing denied, send a test prayer with alerts on).
- Real YouTube playback and Google Fonts (blocked in the test sandbox).
- Session expiry timing, large video uploads, real payment flows (the site has no payment gateway; giving shows admin-entered details only).

## Outstanding configuration
- Domain placeholders (step 4). Add a real phone/address/social links in the admin; none were invented.
- Notification e-mail (optional). Meta Pixel ID (optional, existing).
- Mission, vision, statement of faith and founder text are still the draft wording already in the project: replace with official wording.
- Admin sign-in tokens are kept in browser storage (existing design); consider moving to HttpOnly cookies later.
- Events/announcements are stored inside the site settings, so **Save Changes** publishes them.
