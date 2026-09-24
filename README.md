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

## Content to confirm with the ministry
The Mission, Vision, Values, Statement of Faith and "Our Story" text are drafts written for the site. Replace them with the church's official wording before launch. A higher-resolution logo file (the current one is 191×115px) will look sharper on retina screens.
