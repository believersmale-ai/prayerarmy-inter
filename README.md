> **Hosting:** this repository contains both PHP/Apache and Node/MySQL backends. The November 16 audit records a Node deployment; older instructions below describe PHP hosting. Confirm the deployed runtime using `/api/runtime` after this update. The Node modules are now complete; see **docs/NODE-BACKEND-COMPLETION.md** for Node 22 requirements, configuration, validation and hosting status. Follow **HOSTINGER-DEPLOY.md** for the PHP deployment path.

## Deployment & backend (read this first)

This site deploys to Vercel as a **plain static site**. No server, no build step, no environment
variables. Everything you edit in the admin panel (`/admin`) is stored in Supabase.

### How access works
- Each person signs in at `/admin` with **their own email and password**. Roles:
  - **System admin**: everything, including the Team page and security.
  - **Editor**: website content, events, giving, live status, pictures, sermons, visitor stats.
  - **Media**: pictures, videos, audio and the sermon archive only.
  - **Pastoral care**: private prayer requests, new visitors, testimonies and the prayer wall only.
- Roles are checked on the server (Supabase Edge Functions), not just hidden in the page.
- A **shared passkey** still exists for the first sign-in. Use it once to create a System admin
  account under *Team & Accounts*, then turn it off under *My Account & Backup*.
- If every System admin is locked out, run `update admin_config set legacy_enabled = true;` in the
  Supabase SQL editor to bring the shared passkey back, then fix the accounts.

### Before going public (checklist)
1. Create your own System admin account and turn the shared passkey off.
2. In Supabase: Authentication > Sign In / Providers > Email > turn **off** "Allow new users to sign up".
3. Check `/functions/v1/podcast-feed` opens as XML (it feeds your audio sermons to podcast apps).
4. Optional Meta Pixel: a System admin pastes the Pixel ID under *Social Media Channels*. Visitors see a
   cookie notice and nothing loads until they press Accept (people who send Do Not Track or Global
   Privacy Control are never tracked). Only event names are sent (page view, sermon viewed, share,
   connect form, prayer request, giving click), never names or messages. `privacy.html` explains this
   to visitors; have it reviewed for your situation, and check whether the church must register with
   Ghana's Data Protection Commission.
5. If you add a custom domain: add it to `ALLOWED_EXACT` in each Edge Function's `cors.ts`, and
   update the `og:url` / `og:image` addresses in `index.html`.

### What lives where
- `site_settings`: all editable site text (publicly readable, written only by `save-settings`).
- `messages`, `message_comments`, `testimonies`, `wall_prayers`, `prayer_requests`,
  `connect_requests`: public forms can only add rows; everything private is read through
  `manage-content`, which checks the person's role.
- `admin_roles`, `admin_config`, `login_attempts`, `rate_limits`: no public access at all.
- `media` storage bucket: public to read, written only by `upload-media` / `delete-media`.
- Public forms are rate limited per visitor (for example 20 prayer requests per hour).

The Supabase URL and anon key inside `script.js` and `admin.js` are meant to be public. They can
only do what the database's access rules allow.

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

## Live broadcast now plays on-site (this pass)
The Live section has a real inline video player, not just a link out:
- Shows a thumbnail preview (the YouTube video's own thumbnail when the
  stream URL is a normal watch/live/youtu.be link, or your configured hero
  image as a fallback) with a play button over it.
- Clicking it (or the "Preview Live Stream" button, or "Watch Live Now" in
  the hero once you're live) embeds and plays the video **right on the
  page** — no more jumping to YouTube in a new tab.
- **For this to embed automatically, set `live.url` in the Site Manager to
  the actual video's link** (a `youtube.com/watch?v=...`, `youtu.be/...`,
  `youtube.com/live/...` link, or a direct `.mp4`/`.webm` file) — that's
  what you'd paste in once a service actually starts streaming. A bare
  channel/handle link (like `youtube.com/@yourhandle/live`) can't be
  embedded by any site without calling YouTube's API to resolve it to a
  channel ID, so in that case the section shows a friendly "not yet
  configured for on-site playback" message instead of silently failing or
  forcing an external redirect.

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
4. Visit `/admin` on your deployed domain and sign in (see "How access works" at the top).



## About & Giving section fixes (this pass)
- **About heading was silently losing its gold accent.** The code that applied your saved
  settings had a no-op check (`s.about.heading.includes('<span>') ? ... : ...`) that always
  took the same branch, so the nice two-tone heading style was wiped out the moment the page
  loaded real settings. Fixed, and upgraded: the Heading field in the admin now supports
  `**double asterisks**` around any part of the text to color it gold (safely escaped first,
  so no raw HTML can be injected through the field).
- **Giving → Mobile Money box now respects line breaks.** If you type multiple lines in the
  Mobile Money / Bank Details field (e.g. MTN MoMo on one line, Telecel Cash on the next), they
  used to run together into one line on the live site. Fixed with `white-space: pre-line`.
- **Giving section layout hardened for in-between screen widths.** Between roughly 900–1180px
  wide, the giving text and the "Giving Information" button could get squeezed together with no
  wrapping. Added `flex-wrap` and sensible flex-basis so it gracefully wraps instead of
  crowding or overflowing.

## What changed in this pass
- **Mobile nav bug fixed** — the slide-out panel was trapped inside the header due to a
  `backdrop-filter` CSS quirk (it creates a containing block for `position:fixed`
  descendants). Moved the blur to a pseudo-element so the panel now correctly overlays
  the full screen.
- **Announcement bar now pops** — animated slide-down entrance, animated slide-up dismiss,
  remembers a dismissal per message for the session.
- **New: Messages Archive, Comments & Prayer Requests** — see `DEPLOY_MESSAGES_FEATURE.md`
  for the two steps needed to turn this on (a SQL migration + one Edge Function deploy —
  I don't have access to your live Supabase project so I could not run these myself).

## Content to confirm with the ministry
The Mission, Vision, Values, Statement of Faith and "Our Story" text are drafts written for the site. Replace them with the church's official wording before launch. A higher-resolution logo file (the current one is 191×115px) will look sharper on retina screens.
