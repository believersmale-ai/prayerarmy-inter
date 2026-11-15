# Prayer Army International — Premium Redesign & Editable Content

This update is an additive visual and content-management refinement of the supplied project.

## What changed

- Added `premium.css`, loaded after the existing stylesheet. It refines the public website with a more premium editorial layout, richer navy/gold palette, improved typography, spacing, cards, imagery treatments, mobile layouts and restrained motion.
- Added matching visual refinements to the existing admin dashboard without replacing its navigation or workflows.
- Kept the existing church photographs and logo in place; no supplied media was replaced.
- Expanded the existing site-settings content model with a `content` object for section headings, section introductions, quick-link copy, contact-card labels, footer labels and the full Statement of Faith.
- Added an **Additional Page Content (JSON)** editor under **Admin → About & Foundation → Website Page Content** for the public-facing copy that was previously hard-coded in the page markup.
- Added defaults and backward-compatible merging so installations with older saved settings still receive the new editable content defaults. Existing saved settings continue to override defaults.
- Split headings use `|` between the normal and highlighted phrase. Example: `Built on|prayer, truth and faith.`
- Statement of Faith is stored as an array of text entries in `content.faithStatements`.

## Existing features preserved

No database schema, API route, authentication, admin role, permission, public form, media storage, sermon, event, prayer wall, testimony, giving or contact workflow was intentionally removed or rewritten. Settings continue to be saved through the existing authenticated settings endpoint and existing `site_settings` JSON column.

## Editing website content

1. Sign in to the existing admin dashboard.
2. Use the existing Hero, General, Sermons, Events, About & Foundation, Giving, Prayer, Social and other tabs for their established fields.
3. Open **About & Foundation → Website Page Content** to edit the additional public headings, section copy, quick-link text, contact labels, footer labels and Statement of Faith.
4. Keep the JSON valid. Edit text values only; do not remove commas, quotation marks, braces or array brackets.
5. For split headings, use `|` to divide the normal text from the gold-highlighted text.
6. Save Changes. The existing settings system publishes the changes to the public website.

## Deployment notes

- Upload the updated project files while retaining the existing `api/config.php` production credentials and hosting configuration.
- Back up the current website files and database before deployment.
- No SQL migration is required for the new page copy because it is stored in the existing JSON settings data. The admin and public site merge defaults for older installations.
- Keep the existing API and database configuration unchanged.

## Validation performed

- JavaScript syntax checks: `script.js`, `admin.js`, `server.js`.
- PHP syntax checks for API PHP files.
- JSON validation for `site-settings.json`.
- HTML ID duplicate scan for `index.html` and `admin.html`.

This is source-level validation. A live browser, production database, email delivery, authentication session and hosting deployment test were not performed in this environment.
