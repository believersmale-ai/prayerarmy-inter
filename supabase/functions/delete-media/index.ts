// delete-media — removes an admin-uploaded file from the public `media` bucket.
//
// Auth: re-uses your existing `verify-passkey` function, so no database
// details are needed here. The service-role key (auto-provided by Supabase)
// does the actual deletion; it never leaves the server.
//
// Request  POST { passkey, filename }          (also accepts name / path / filenames[])
// Response 200 { success: true, deleted: [...] }  |  4xx/5xx { error: "reason" }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET = "media";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const passkey = String(body?.passkey ?? "");
  if (!passkey) return json({ error: "Passkey required" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? req.headers.get("apikey") ?? "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // 1) authenticate with the existing verify-passkey function
  const auth = await fetch(`${url}/functions/v1/verify-passkey`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anon },
    body: JSON.stringify({ passkey }),
  });
  if (!auth.ok) return json({ error: auth.status === 429 ? "Too many attempts, wait and retry" : "Incorrect passkey" }, auth.status === 429 ? 429 : 401);

  // 2) work out which files to delete (single or several)
  const raw: unknown[] = Array.isArray(body?.filenames)
    ? body.filenames
    : [body?.filename ?? body?.name ?? body?.path];
  const names = raw
    .map((n) => decodeURIComponent(String(n ?? "")).trim())
    .map((n) => n.split("/media/").pop()!.replace(/^\/+/, ""))
    .filter((n) => n && !n.includes("..") && !n.startsWith("."));
  if (!names.length) return json({ error: "No valid filename provided" }, 400);

  // 3) delete with the service role
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data, error } = await admin.storage.from(BUCKET).remove(names);
  if (error) return json({ error: `Storage error: ${error.message}` }, 500);
  if (!data || data.length === 0) return json({ error: "File not found in storage (already deleted?)" }, 404);

  return json({ success: true, deleted: data.map((d: any) => d.name) });
});
