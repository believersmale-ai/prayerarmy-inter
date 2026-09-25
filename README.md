## Deployment & backend (read this first)

This site deploys to Vercel as a **plain static site** — no server, no build
step. All admin-editable content (the text throughout the site) and media
uploaded through the Site Manager (`/admin`) are stored in Supabase, not on
disk, so nothing is lost between deploys or requests:

- **`site_settings` table** — holds all the editable site copy. Publicly
  readable (that's how the homepage loads it), writable only through the
  `save-settings` Edge Function.
- **`admin_config` table** — holds the manager passkey. Not readable by
  anyone except the service role inside Edge Functions.
- **`media` storage bucket** — holds files uploaded through the Site
  Manager. Publicly readable, writable only through the `upload-media` /
  `delete-media` Edge Functions.
- **Edge Functions** (`verify-passkey`, `save-settings`, `upload-media`,
  `delete-media`, `change-passkey`) — every one of these re-checks the
  passkey server-side before touching anything, so the passkey itself is
  never exposed in a public API response (it used to be, in the old
  file-based version).

The Supabase URL and anon key are embedded directly in `script.js` and
`admin.js` — that's expected, the anon key can only do what Row Level
Security explicitly allows (read public settings/media). Nothing secret is
in the client code.

To change the manager passkey, log into `/admin`, go to Settings, type a
new passkey into "New Passkey", and click Save — no code changes needed.

Just push this folder to Vercel (or any static host). There's no `PORT`,
no environment variables, and no server process to configure.

---

# Prayer Army International — Website Starter

This is a responsive, production-style static website concept built using the **exact photographs supplied in the conversation**. No stock images or generated images are used.

## Included
- Responsive homepage
- Sticky navigation + mobile menu
- Hero section using the supplied outdoor preaching photo
- Founder section using the supplied Prophet Suglo Prosper portrait
- Sermon/media section using supplied service photos
- Live-stream section
- Events section featuring the supplied Manifests Conference 2026 poster
- Ministry photo gallery using the supplied images
- Prayer request form UI
- Giving/partnership section
- Footer

## Run locally
Open `index.html` in a browser, or use any static server, e.g.:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Going live — one file to edit
Open `script.js` and fill in the **SITE** block at the top. Anything left blank is hidden (or falls back to the footer/prayer section), so nothing on the page is a dead link.
- `links` — live stream, sermon library, latest sermon, events, event registration, gallery, giving page
- `social` — YouTube, Facebook, Instagram, TikTok, X
- `phone`, `whatsapp`, `email`, `address` — shown in the footer
- `prayerEndpoint` — a URL that accepts a JSON POST (Formspree, Supabase edge function, etc.). If blank but `email` is set, the form opens the visitor's email app instead.
- `eventStart` / `eventEnd` — drive the Manifests Conference countdown


## Nav, alignment, responsiveness & animation upgrade (this pass)
- **Fixed a real layout bug:** the announcement bar (when enabled in the manager) used to render underneath the fixed header. It's now a proper fixed top bar, the header sits right below it, and every anchor link / the hero's top spacing adjusts automatically to match — including when you dismiss the bar.
- **Mobile nav rebuilt:** it now slides in as a real off-canvas panel with a dimmed backdrop, staggered link entrance, body-scroll lock while open, and an animated hamburger ↔ close icon, instead of an instant show/hide.
- **Tablet breakpoint added** (~900–1180px) so the 3-column Foundation cards and the 4-column quick links no longer jump straight to a single column — they now step through 2 columns first.
- **Section reveals now stagger per-card** (Foundation, Gallery, Contact, Quick Links) instead of fading the whole block in at once.
- Respects `prefers-reduced-motion` throughout.

## Bug fixes & hardening (this pass)
- **Removed dead code:** `script.js` referenced a "floating dock" live-status
  widget (`#dock-live-status-text` / `#dock-live-status-icon`) that no
  longer exists in `index.html`. It was inert (guarded by `if` checks) but
  cluttered the file — removed.
- **Made the gallery lightbox crash-proof:** it previously assumed
  `#lightbox` and its inner buttons always exist and called
  `document.querySelector` on a `null` root if they didn't, which throws
  and can halt every script after it on the page. It's now fully guarded
  and simply does nothing if the dialog or gallery photos are missing.
- **Fixed a timezone bug in the Site Manager's Events tab:** editing the
  conference start/end date+time from outside GMT (e.g. a diaspora admin)
  used to silently shift the saved time by the browser's UTC offset on
  every save, because the datetime field was read back with the browser's
  *local* timezone instead of UTC. Saving from Ghana (GMT, no DST) never
  showed the bug, but it was there. Fixed by parsing the field as UTC.
- **Admin console no longer indexable:** added `<meta name="robots"
  content="noindex, nofollow">` to `admin.html`, a `robots.txt` disallowing
  `/admin`, `/manage`, `/portal`, and an `X-Robots-Tag` header on those
  routes via `vercel.json` — so the passkey screen can't end up in search
  results.
- **Added baseline security headers** in `vercel.json`:
  `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, a minimal `Permissions-Policy`, and
  `X-Frame-Options: DENY` on the admin routes (so the console can't be
  framed by another site).
- **Removed `server.js`:** it was a leftover Express/Multer server from
  before the site moved to Supabase, imported `express` and `multer`
  which were never in `package.json`, and would fail immediately if run —
  and it's not used by the Vercel deployment at all (confirmed: this is a
  static site, see the top of this file). Deleted it along with the empty
  `pnpm-lock.yaml` to avoid confusing future maintainers into thinking a
  Node server needs to be run or `npm install`ed.
- **`statement-of-faith.png`** (a bundled photo not previously listed
  anywhere) is now included in `assets/images/manifest.json` so it shows
  up and is selectable in the Site Manager's Media Library.
- Verified: no duplicate element `id`s, no mismatched `id` references
  between `admin.js` ↔ `admin.html` or `script.js` ↔ `index.html`, and
  both JS files parse cleanly.

## Deploying to Vercel
1. Push this folder to a GitHub/GitLab/Bitbucket repo (or drag-and-drop it
   into the Vercel dashboard).
2. In Vercel, "Add New Project" → import the repo. Framework preset:
   **Other** (no build step needed — `vercel.json` and `package.json`
   already reflect that).
3. Deploy. No environment variables are required; the Supabase URL and
   anon key are safe to ship in the client code (see above).
4. Visit `/admin` on your deployed domain to manage content — sign in with
   the passkey stored in Supabase's `admin_config` table.

## Content to confirm with the ministry
The Mission, Vision, Values, Statement of Faith and "Our Story" text are drafts written for the site. Replace them with the church's official wording before launch. A higher-resolution logo file (the current one is 191×115px) will look sharper on retina screens.
