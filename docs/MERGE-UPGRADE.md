# Merge of the "upgraded" package into the Page Builder version

Base for the merge: first Hostinger merge. Sides: redesign + bug fixes + Page Builder (ours) and the upgrade package (theirs).

Took from the upgrade: dashboard, announcements, global search, sermon speaker/category/filters, live countdown, prayer follow-up, notifications, SEO/sitemap, signed form tokens + honeypot, one-"I prayed"-per-person, testimony name permission, login/session fixes, its `.htaccess` set, new form markup.
Kept from ours: template.css redesign, editable page wording (uiText/content), Page Builder (order, hide, publish, custom sections, preview), fixed `server.js` (the upgrade shipped the old insecure one), single privacy/terms pages (no duplicate folders), lockfile.
Combined by hand: homepage markup (upgrade structure + editable-text keys), default wording (so editable text matches the markup), `.htaccess`, Announcements added to the Page Builder section list (a layout saved before this upgrade slots it in after Quick links).
Still to do by you: replace `YOUR-DOMAIN.com` (index.html og/canonical, robots.txt Sitemap) and keep your live `api/config.php`.
