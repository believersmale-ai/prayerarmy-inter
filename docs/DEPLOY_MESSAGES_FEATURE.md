# Deploying the Messages / Comments / Prayer Requests feature

I don't have access to your actual Supabase project (`rftshprvuniszeorgrvd`) from here, so I
couldn't run these steps for you. Everything is written and tested for syntax — you just need
to apply it. Two steps, about five minutes total.

## 1. Run the SQL migration
Open your Supabase project → **SQL Editor** → New query → paste the contents of
`supabase/migrations/0001_messages_comments_requests.sql` → **Run**.

This creates three tables (`messages`, `message_comments`, `prayer_requests`) with Row Level
Security already configured: anyone can read messages/comments and post a comment or a prayer
request; only your passkey-gated Edge Function can create/delete a message, delete a comment,
or read/delete a prayer request.

## 2. Deploy the Edge Function
Using the Supabase CLI (`npm i -g supabase`, then `supabase login` and `supabase link` if you
haven't already):

```bash
supabase functions deploy manage-content --no-verify-jwt --project-ref rftshprvuniszeorgrvd
```

Or paste `supabase/functions/manage-content/index.ts` into the Supabase Dashboard →
**Edge Functions** → **New function** named `manage-content`.

No new secrets are needed — it reuses your existing `verify-passkey` function to check the
passkey, and Supabase auto-injects `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` /
`SUPABASE_ANON_KEY` into every Edge Function.

## That's it
Once both are done:
- The public site's Sermons section shows a live "Past Messages & Broadcasts" list (text +
  optional link + optional audio/video — never a picture), with a working comment box.
- The Prayer form on the public site saves straight into `prayer_requests` — it no longer ever
  opens an email app or leaves the site.
- In the admin panel: **Messages Archive** lets you add/delete messages; **Submitted Requests**
  shows prayer requests privately with mark-read/delete; the **Live** tab has an
  "Archive this broadcast & go offline" button that saves the current broadcast into Messages
  and turns live status off in one click.
- Deleting an uploaded file (audio/video/image) already worked before this change — it's the
  existing 🗑 button in the **Media Uploader** tab; nothing new was needed there.

## One caveat I can't verify
The existing `upload-media` Edge Function's file-type check (visible in `admin.js`, not in a
file I have access to) may currently only accept image/video MIME types. If you try uploading
an audio file (mp3/wav/m4a) for a message and it's rejected, that function needs its allow-list
widened to include `audio/*` — I can't see or edit that function from here since it lives in
your project.
