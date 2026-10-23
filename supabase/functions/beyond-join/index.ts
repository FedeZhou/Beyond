// BEYOND — beyond-join
// The join link from the acceptance email (join.html?token=…).
//
//   { action: "check", token }            → { firstName, email, accountExists }
//   { action: "claim", token, password }  → creates the account with that password.
//                                           Its card is pre-filled by the database
//                                           trigger (supabase/002-applications.sql).
//
// If the email ALREADY has an account in this Supabase project (the project is
// shared with another app), its password is never changed here: the person
// signs in with the password they have, or uses "Forgot password".
//
// Errors: 400 invalid / password · 404 invalid_token · 410 expired · 409 used · 429 rate_limited

import { corsHeaders, guard, ipHash, json, readJson, sha256, str } from "../_shared/http.ts";
import { db, userIdByEmail, withinLimit } from "../_shared/db.ts";

const MIN_PASSWORD = 10;
const MAX_PASSWORD = 72;     // the most Supabase (bcrypt) uses

type Invite = { email: string; role: string; application_id: string | null; expires_at: string | null; claimed_at: string | null };

async function findInvite(token: string): Promise<{ invite?: Invite; error?: string; status?: number }> {
  if (!/^[A-Za-z0-9_-]{30,100}$/.test(token)) return { error: "invalid_token", status: 404 };
  const { data, error } = await db().from("beyond_invites")
    .select("email, role, application_id, expires_at, claimed_at")
    .eq("token_hash", await sha256(token)).maybeSingle();
  if (error) throw error;
  if (!data) return { error: "invalid_token", status: 404 };
  if (data.claimed_at) return { error: "used", status: 409 };
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return { error: "expired", status: 410 };
  return { invite: data };
}

async function firstName(invite: Invite): Promise<string> {
  if (!invite.application_id) return "";
  const { data } = await db().from("beyond_applications").select("first_name").eq("id", invite.application_id).maybeSingle();
  return (data && data.first_name) || "";
}

// The token hash stays, so opening the link again says "already used" rather than "not valid"
async function markClaimed(email: string) {
  await db().from("beyond_invites").update({ claimed_at: new Date().toISOString() }).eq("email", email);
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const stop = guard(req, cors);
  if (stop) return stop;

  try {
    if (!(await withinLimit("join:ip:" + (await ipHash(req)), 30, "1 hour"))) {
      return json({ error: "rate_limited" }, 429, cors);
    }
    const body = await readJson(req);
    if (!body) return json({ error: "invalid" }, 400, cors);

    const found = await findInvite(str(body.token));
    if (!found.invite) return json({ error: found.error }, found.status || 400, cors);
    const invite = found.invite;
    const existingUser = await userIdByEmail(invite.email);

    if (body.action === "check") {
      return json({ firstName: await firstName(invite), email: invite.email, accountExists: !!existingUser }, 200, cors);
    }

    if (body.action !== "claim") return json({ error: "invalid" }, 400, cors);

    if (existingUser) {
      // The card was already created when the invite was made; leave the password alone
      await markClaimed(invite.email);
      return json({ ok: true, email: invite.email, accountExists: true }, 200, cors);
    }

    const password = typeof body.password === "string" ? body.password : "";
    if (password.length < MIN_PASSWORD || new TextEncoder().encode(password).length > MAX_PASSWORD) {
      return json({ error: "password" }, 400, cors);
    }

    const { error } = await db().auth.admin.createUser({ email: invite.email, password, email_confirm: true });
    if (error) {
      console.error("createUser failed", error);
      // e.g. the project asks for a stronger password
      if (error.status === 422 || /password/i.test(error.message)) return json({ error: "password", message: error.message }, 400, cors);
      throw error;
    }
    await markClaimed(invite.email);
    return json({ ok: true, email: invite.email, accountExists: false }, 200, cors);
  } catch (error) {
    console.error("beyond-join failed", error);
    return json({ error: "server" }, 500, cors);
  }
});
