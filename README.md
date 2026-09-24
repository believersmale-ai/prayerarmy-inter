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
