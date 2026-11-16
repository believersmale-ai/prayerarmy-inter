# Prayer Army International — Full Visual Template Replacement

This package replaces the previous public-facing visual template with a new premium editorial design while retaining the existing content and application wiring.

## Design direction

- Prayer Army International's existing gold identity and supplied logo remain in use.
- The new visual system uses deep midnight/navy, antique gold, warm ivory and restrained burgundy accents.
- The homepage has been restyled as a premium church and ministry experience: cinematic hero, editorial welcome section, mission/vision/values, statement of faith, sermon library, live broadcast, events, gallery, prayer and testimony community, giving, contact and footer.
- Responsive layouts are provided for desktop, tablet and mobile, with reduced-motion and visible keyboard focus support.

## What was deliberately retained

- Existing public HTML section IDs, anchor links and JavaScript selectors.
- Existing forms, form names, validation hooks and submission handlers.
- Existing sermon player, live player, image lightbox, announcement modal, consent controls and toast container.
- Existing media files and exact church photographs.
- Existing admin dashboard, roles, login/session handling and content-management workflows.
- Existing API routes, server code, database schema and settings persistence.

## Editable content

The existing admin settings workflow remains the source of truth. Use the existing admin tabs for:

- General identity, logo and slogan
- Hero heading, supporting copy, buttons and background image
- About copy, founder details and statistics
- Mission, vision, values, founder biography and statement-of-faith image
- Live stream details
- Sermons and sermon links
- Events and weekly activities
- Giving methods and partnership information
- Prayer form configuration
- Contact details and social links
- Announcement settings

Use **About & Foundation → Website Page Content** for additional section headings, introductions, quick-link copy, contact-card labels, footer labels, navigation labels, form labels, placeholders, select-option labels and the individual Statement of Faith statements. The `content.uiText` object controls the smaller interface copy marked in the page. This editor stores the content in the existing site settings JSON; it does not require a database migration.

## Files changed for the visual replacement

- `index.html`: loads `template.css` instead of the previous `premium.css` layer.
- `template.css`: new visual template, retaining the existing structural and interactive CSS compatibility layer in `styles.css`.
- `admin.html`, `admin.js`, `script.js`, `site-settings.json`: retain the existing editable-content enhancement from the previous package.

## Deployment

1. Back up the live site files and database.
2. Upload the project files.
3. Preserve the production `api/config.php` values and hosting-specific settings.
4. Clear browser/CDN cache so the new `template.css` is loaded.
5. Test public forms, admin login, content saves, sermons, events, live stream, prayer wall, testimonies and media in the production environment.

No database schema changes are introduced by this visual template replacement.

## Verification limits

Source-level checks can verify markup, scripts and configuration. They cannot substitute for a full production browser test against the live database, email provider, media storage and hosting environment. Those live integrations should be tested after deployment.
