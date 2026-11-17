# Media library safeguards

## Changes
- Bundled images are labeled **Hide from Library**, never Delete. Hidden assets can be restored from the Hidden tab.
- The official `prayer-army-logo.png` is protected against hiding. It remains selectable.
- Uploaded files are labeled **Delete Upload**. This permanently deletes the stored file and its `site_media_posts` gallery metadata.
- Caption publishing and homepage visibility continue to use migration 004. Bundled visibility now uses migration 005 and survives redeployment.
- The existing media upload, preview, copy-link and assign-to-hero/logo/faith/sermon controls are retained.

## Required rollout
1. Back up the production database and media directory.
2. Apply `migrations/005_hidden_media_assets.sql` in the active database. Migrations 003 and 004 must already be present.
3. Deploy main and refresh the admin portal.
4. Check that the official logo shows **Protected Logo** and is not hideable.
5. Hide a nonessential bundled image and restore it from **Hidden**; confirm the state survives refreshing the admin portal.
6. Upload a small test image, add a caption and publish it to the homepage; verify it displays publicly.
7. Delete only the test upload and verify it disappears from both the library and public gallery.

## Important
Hiding a bundled asset affects library visibility, not its physical file or any existing direct image URLs. Protecting the logo against hiding does not prevent administrators from deliberately replacing its site setting with another image. File deletion is permanent and cannot be undone without backup. A configured persistent PAI_DATA_DIR is required for production uploads to survive redeployment.

These changes are committed to GitHub but live deployment, migration execution and browser testing must be verified separately.
