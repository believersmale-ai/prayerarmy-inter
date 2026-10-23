# Fix: deleting uploaded media

The Site Manager deletes uploads by calling the `delete-media` Edge Function.
If deleting fails, that function is missing, outdated, or expects different
fields. `supabase/functions/delete-media/index.ts` is a known-good replacement.

## Deploy (2 minutes)

**Option A — Supabase dashboard (no tools needed)**
1. Supabase → your project → **Edge Functions**.
2. Open `delete-media` (or **Deploy a new function** named `delete-media`).
3. Paste the contents of `supabase/functions/delete-media/index.ts` → **Deploy**.
4. In the function's settings turn **"Verify JWT" OFF** (same as your other
   admin functions — the admin page sends only the `apikey` header).

**Option B — CLI**
```
supabase functions deploy delete-media --no-verify-jwt --project-ref rftshprvuniszeorgrvd
```

## Test
Site Manager → Media → press 🗑 on an *Uploaded* file. You should see
"Media file deleted". If not, the red message now says exactly why
(e.g. "Incorrect passkey", "File not found in storage").

Note: items labelled "Church Asset" are files inside the website folder, not
uploads, so they cannot be deleted from the admin.
