// manage-content
//
// One passkey-gated Edge Function for every admin-only write this feature
// needs: creating/deleting messages, deleting a comment, and reading/deleting
// prayer requests. It never re-implements passkey checking — it forwards the
// passkey to the project's existing `verify-passkey` function and only
// proceeds if that call succeeds, then uses the service-role key (which
// bypasses Row Level Security) to perform the actual write.
//
// Deploy with:
//   supabase functions deploy manage-content --no-verify-jwt
//
// Required secrets (already set for your project since verify-passkey uses
// them too): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY are auto-injected by
// Supabase for every Edge Function — no extra configuration needed.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function passkeyIsValid(passkey: string): Promise<boolean> {
  if (!passkey) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-passkey`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ANON_KEY },
      body: JSON.stringify({ passkey }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { passkey?: string; action?: string; payload?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { passkey, action, payload = {} } = body;
  if (!(await passkeyIsValid(passkey || ""))) {
    return json({ error: "Invalid or missing passkey" }, 401);
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    switch (action) {
      case "create_message": {
        const { title, description, link, media_url, media_type, source } = payload as Record<string, string>;
        if (!title || !String(title).trim()) return json({ error: "title is required" }, 400);
        const { data, error } = await db
          .from("messages")
          .insert({
            title: String(title).trim(),
            description: description ? String(description).trim() : null,
            link: link ? String(link).trim() : null,
            media_url: media_url ? String(media_url).trim() : null,
            media_type: media_type === "audio" || media_type === "video" ? media_type : null,
            source: source === "live" ? "live" : "manual",
          })
          .select()
          .single();
        if (error) throw error;
        return json({ message: data });
      }

      case "delete_message": {
        const { id } = payload as Record<string, string>;
        if (!id) return json({ error: "id is required" }, 400);
        const { error } = await db.from("messages").delete().eq("id", id);
        if (error) throw error;
        return json({ deleted: id });
      }

      case "delete_comment": {
        const { id } = payload as Record<string, string>;
        if (!id) return json({ error: "id is required" }, 400);
        const { error } = await db.from("message_comments").delete().eq("id", id);
        if (error) throw error;
        return json({ deleted: id });
      }

      case "list_prayer_requests": {
        const { data, error } = await db
          .from("prayer_requests")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(500);
        if (error) throw error;
        return json({ requests: data });
      }

      case "mark_prayer_request_read": {
        const { id, is_read } = payload as Record<string, unknown>;
        if (!id) return json({ error: "id is required" }, 400);
        const { error } = await db
          .from("prayer_requests")
          .update({ is_read: is_read !== false })
          .eq("id", id as string);
        if (error) throw error;
        return json({ ok: true });
      }

      case "delete_prayer_request": {
        const { id } = payload as Record<string, string>;
        if (!id) return json({ error: "id is required" }, 400);
        const { error } = await db.from("prayer_requests").delete().eq("id", id);
        if (error) throw error;
        return json({ deleted: id });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
