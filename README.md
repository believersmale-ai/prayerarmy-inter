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

## Content to confirm with the ministry
The Mission, Vision, Values, Statement of Faith and "Our Story" text are drafts written for the site. Replace them with the church's official wording before launch. A higher-resolution logo file (the current one is 191×115px) will look sharper on retina screens.
