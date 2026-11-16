# Merge of the "upgraded" package into the Page Builder version

Base for the merge: first Hostinger merge. Sides: redesign + bug fixes + Page Builder (ours) and the upgrade package (theirs).

Took from the upgrade: dashboard, announcements, global search, sermon speaker/category/filters, live countdown, prayer follow-up, notifications, SEO/sitemap, signed form tokens + honeypot, one-"I prayed"-per-person, testimony name permission, login/session fixes, its `.htaccess` set, new form markup.
Kept from ours: template.css redesign, editable page wording (uiText/content), Page Builder (order, hide, publish, custom sections, preview), fixed `server.js` (the upgrade shipped the old insecure one), single privacy/terms pages (no duplicate folders), lockfile.
Combined by hand: homepage markup (upgrade structure + editable-text keys), default wording (so editable text matches the markup), `.htaccess`, Announcements added to the Page Builder section list (a layout saved before this upgrade slots it in after Quick links).
Still to do by you: replace `YOUR-DOMAIN.com` (index.html og/canonical, robots.txt Sitemap) and keep your live `api/config.php`.

## Extras folded into the main files
`site-extras.js` is now at the end of `script.js`, `admin-extras.js` before the final `checkAuthSession()` call in `admin.js`, and `template.css` at the end of `styles.css` (same cascade order as before). The three extra files and their `<link>`/`<script>` tags are gone, so there is nothing extra to upload.

## Errors fixed in this pass
1. `admin.html`: the Prayer Wall view had a stray `</div></div>` and no `#wall-admin-list` container, so the wall list could never render (admin.js looks for that id). Container added, tags balanced.
2. `server.js` (Node host): whitelist listed `template.css` but not `site-extras.js` / `admin-extras.js`, so announcements, search, the live countdown, the admin dashboard and notifications would 404 there. Everything is now inside whitelisted files.
