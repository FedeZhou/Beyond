// BEYOND — the Supabase client the Edge Functions use.
// It uses the service_role key, which Supabase gives every Edge Function
// automatically: it never leaves Supabase and is never in the website.

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { env } from "./env.ts";

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!client) {
    client = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

// One hit in a rate-limit bucket (see beyond_hit in supabase/002-applications.sql).
// True while the bucket is within its limit. If the check itself fails, let the request through.
export async function withinLimit(bucket: string, max: number, window: string): Promise<boolean> {
  const { data, error } = await db().rpc("beyond_hit", { p_bucket: bucket, p_max: max, p_window: window });
  if (error) {
    console.error("beyond_hit failed", error);
    return true;
  }
  return data === true;
}

export async function userIdByEmail(email: string): Promise<string | null> {
  const { data, error } = await db().rpc("beyond_user_id_by_email", { p_email: email });
  if (error) throw error;
  return (data as string | null) || null;
}

export async function audit(
  actor: { id: string; email: string } | null,
  action: string,
  target: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await db().from("beyond_audit_log").insert({
    actor: actor ? actor.id : null,
    actor_email: actor ? actor.email : null,
    action,
    target,
    details,
  });
  if (error) console.error("audit log failed", error);
}
