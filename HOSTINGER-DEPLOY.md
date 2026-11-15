> **Repo layout note:** in this repository the website files sit at the project root (there is no
> `public_html/` folder). Wherever this guide says "the contents of `public_html/`", upload the repo
> root instead. You do **not** need to upload `supabase/`, `docs/`, `server.js`, `package.json` or
> `pnpm-lock.yaml`; the root `.htaccess` blocks them from the web if they are uploaded by accident.
> The `uploads/` folder only needs its `.htaccess`; media uploaded through the admin panel is kept
> out of git on purpose.

# Prayer Army International - Hostinger deployment (PHP + MySQL, no Supabase)

Everything runs on your Hostinger Business plan: the site is static files, and the
backend is a small PHP API (`public_html/api/`) that stores data in MySQL and uploads
in `public_html/uploads/`.

## 1. Create the database (hPanel)
1. Websites > your site > Databases > **MySQL Databases**.
2. Create a database and a user (Hostinger adds a prefix such as `u123456789_`). Save the password.
3. Make sure the user has **All privileges** on that database.

## 2. Edit api/config.php
Open `public_html/api/config.php` in File Manager (or on your computer before uploading) and set:
- `DB_NAME`, `DB_USER`, `DB_PASS` - exactly as shown in hPanel (with the prefix).
- `SETUP_KEY` - a long secret phrase only you know.

## 3. Upload
Upload everything inside `public_html/` into your site's `public_html` (delete Hostinger's default placeholder first).
Turn on **Show hidden files** so you can see `.htaccess`, `api/.htaccess`, `api/.user.ini` and `uploads/.htaccess`; all four must be there.

## 4. Check PHP (hPanel > Advanced > PHP Configuration)
- PHP **8.1 or newer**.
- Extensions on: `pdo_mysql`, `mbstring`, `fileinfo`.
- For big videos/audio, set `upload_max_filesize` and `post_max_size` to 200M (the included `api/.user.ini` already asks for this; hPanel values win if they are lower).
- Make sure SSL (free) is active. The `.htaccess` forces HTTPS.

## 5. Put your real domain in
Replace `https://YOUR-DOMAIN.com` with your domain in `index.html` (3 places: og:url, og:image x2) and `script.js` (1 place).

## 6. First-time setup
1. Visit `https://YOUR-DOMAIN.com/api/setup.php`.
2. Enter your SETUP_KEY, your name, email and a password (10+ characters).
3. This creates the tables, loads the website text from `site-settings.json`, and makes you the System admin.
4. **Delete `api/setup.php` from the server** (it locks itself after one admin exists, but remove it anyway).

## 7. Use it
- Sign in at `/admin` (also `/manage`, `/portal`) with your email and password.
- Team & Accounts: add Editors, Media and Pastoral-care people. Roles are enforced on the server.
- The **shared passkey is OFF by default.** Leave it off.
- Podcast feed for audio sermons: `https://YOUR-DOMAIN.com/podcast.xml`.

## What lives where
| Data | Stored in |
|---|---|
| Website text, events, giving details | MySQL `site_settings` |
| Messages, comments, prayer requests, visitors, testimonies, prayer wall, visit stats | MySQL tables |
| Admin accounts (passwords hashed) and sign-in sessions | MySQL `admin_users`, `sessions` |
| Pictures, video, audio you upload | `public_html/uploads/` |
| Bundled church photos | `public_html/assets/images/` |

## Safety already built in
Passwords are hashed; roles are checked on the server for every private action; sign-in is limited to 10 tries per 15 minutes;
public forms are rate limited per visitor (e.g. 20 prayer requests per hour); uploads accept only picture/video/audio files,
are checked by content, and the uploads folder cannot run code; private requests are never readable without a signed-in role.

## Backups (important now that you own the data)
- hPanel > Files > **Backups** (Hostinger weekly/daily backups on Business) - confirm they are on.
- Also export the database now and then: hPanel > Databases > phpMyAdmin > your database > Export.
- Download `public_html/uploads/` occasionally.

## Troubleshooting
- **"The database is not reachable"**: re-check the three DB values in `api/config.php`.
- **/admin shows the home page or 404**: `.htaccess` did not upload (hidden file), or mod_rewrite is off (it is on by default on Hostinger).
- **Upload fails for big files**: raise `upload_max_filesize` / `post_max_size` in hPanel PHP Configuration.
- **"Too many attempts"** on sign-in: wait 15 minutes. If you sit behind Cloudflare or a shared proxy, all visitors can look like one address; tell me and I will adapt the limiter.
- **Locked out of every admin account**: in phpMyAdmin run `UPDATE admin_users SET active = 1;` and reset a password by deleting the row and visiting `api/setup.php` again after restoring it from the package.

## Upgrade pass
See **UPGRADE-NOTES.md** for the upgrade steps, new features, tests and outstanding configuration.
