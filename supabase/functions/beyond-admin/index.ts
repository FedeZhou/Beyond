// BEYOND — beyond-admin
// Every change made in the admin portal (admin.html, js/admin.js).
// Only a signed-in Beyond admin can use it: the caller's session is checked,
// then their card must have role "admin" and status "approved".
//
// Actions (POST { action, ... }):
//   accept             { id, message? }        accept an application, email the join link
//   reject             { id, notify, message? } reject it (polite email only if notify)
//   resend-invite      { id }                  new join link for an accepted application
//   delete-application { id }                  remove an application, whatever its state
//                                              (an unused join link of an accepted one stops working)
//   create-invite      { email, role }         a join link to hand over yourself (no form, no email)
//   set-member         { id, role?, status? }  change a member's role, suspend or reactivate
//   remove-member      { email }               remove someone from Beyond (card, photos, invite)
//                                              Their account is NEVER deleted: the other app may use it.
// Every action is written to beyond_audit_log.

import { acceptance, rejection } from "../_shared/templates.ts";
import { corsHeaders, guard, json, randomToken, readJson, sha256, str } from "../_shared/http.ts";
import { audit, db, userIdByEmail } from "../_shared/db.ts";
import { JOIN_LINK_DAYS, siteUrl } from "../_shared/env.ts";
import { trySend } from "../_shared/mail.ts";
import type { Application } from "../_shared/application.ts";

type Actor = { id: string; email: string };
type Reply = { status: number; body: Record<string, unknown> };

const BUCKET = "beyond-avatars";
const ok = (extra: Record<string, unknown> = {}): Reply => ({ status: 200, body: { ok: true, ...extra } });
const fail = (status: number, error: string): Reply => ({ status, body: { error } });

async function currentAdmin(req: Request): Promise<Actor | null> {
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data, error } = await db().auth.getUser(jwt);
  if (error || !data.user) return null;
  const { data: profile } = await db().from("beyond_profiles")
    .select("role, status").eq("id", data.user.id).maybeSingle();
  if (!profile || profile.role !== "admin" || profile.status !== "approved") return null;
  return { id: data.user.id, email: (data.user.email || "").toLowerCase() };
}

async function loadApplication(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await db().from("beyond_applications").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

// A new join link: only its hash is stored
async function newJoinToken() {
  const token = randomToken();
  return {
    token,
    token_hash: await sha256(token),
    expires_at: new Date(Date.now() + JOIN_LINK_DAYS * 24 * 3600 * 1000).toISOString(),
  };
}

function joinUrl(token: string): string {
  return siteUrl() + "/join.html?token=" + encodeURIComponent(token);
}

// Replaces any unused invite of this email with a new one (pre-fills the card if the account exists).
// Returns the new link's token, or a Reply when the person is already a member.
async function freshInvite(actor: Actor, email: string, role: string, applicationId: string | null) {
  // Already a member with this email? Then change their role in the Members tab instead.
  const userId = await userIdByEmail(email);
  const { data: invite } = await db().from("beyond_invites").select("*").eq("email", email).maybeSingle();
  if (invite) {
    let onboarded = false;
    if (userId) {
      const { data: profile } = await db().from("beyond_profiles")
        .select("onboarded_at").eq("id", userId).maybeSingle();
      onboarded = !!(profile && profile.onboarded_at);
    }
    if (invite.claimed_at || onboarded) return fail(409, "already_member");
    await db().from("beyond_invites").delete().eq("email", email);
  }

  // A fresh invite row: its trigger pre-fills the card if the account already exists
  const join = await newJoinToken();
  const { error: inviteError } = await db().from("beyond_invites").insert({
    email,
    role,
    application_id: applicationId,
    token_hash: join.token_hash,
    expires_at: join.expires_at,
    invited_by: actor.id,
  });
  if (inviteError) throw inviteError;
  if (userId) {
    await db().from("beyond_profiles").update({ role }).eq("id", userId).is("onboarded_at", null);
  }
  return join;
}

async function sendJoinLink(app: Application & { id: string }, token: string, message: string) {
  const emailError = await trySend(app.email, acceptance(app, joinUrl(token), message));
  if (!emailError) {
    await db().from("beyond_invites").update({ sent_at: new Date().toISOString() }).eq("email", app.email);
  }
  await db().from("beyond_applications").update({ last_email_error: emailError }).eq("id", app.id);
  return emailError;
}

/* ---------------------------------------------------------------------------
   Applications
   --------------------------------------------------------------------------- */
async function accept(actor: Actor, id: string, message: string): Promise<Reply> {
  const app = await loadApplication(id);
  if (!app) return fail(404, "not_found");
  if (app.status === "accepted") return fail(409, "already_accepted");

  const made = await freshInvite(actor, app.email, app.role, app.id);
  if ("status" in made) return made;
  const join = made;

  const { error } = await db().from("beyond_applications").update({
    status: "accepted",
    reviewed_at: new Date().toISOString(),
    reviewed_by: actor.id,
    decision_note: message || null,
  }).eq("id", app.id);
  if (error) throw error;

  const emailError = await sendJoinLink(app, join.token, message);
  await audit(actor, "accept", app.email, { application: app.id, role: app.role, emailError });
  return ok({ emailError });
}

async function reject(actor: Actor, id: string, notify: boolean, message: string): Promise<Reply> {
  const app = await loadApplication(id);
  if (!app) return fail(404, "not_found");
  if (app.status !== "pending") return fail(409, "not_pending");

  const { error } = await db().from("beyond_applications").update({
    status: "rejected",
    reviewed_at: new Date().toISOString(),
    reviewed_by: actor.id,
    decision_note: message || null,
  }).eq("id", app.id);
  if (error) throw error;

  let emailError: string | null = null;
  if (notify) {
    emailError = await trySend(app.email, rejection(app, message));
    await db().from("beyond_applications").update({ last_email_error: emailError }).eq("id", app.id);
  }
  await audit(actor, "reject", app.email, { application: app.id, notified: notify, emailError });
  return ok({ emailError });
}

async function resendInvite(actor: Actor, id: string): Promise<Reply> {
  const app = await loadApplication(id);
  if (!app) return fail(404, "not_found");
  if (app.status !== "accepted") return fail(409, "not_accepted");
  const { data: invite } = await db().from("beyond_invites").select("*").eq("application_id", app.id).maybeSingle();
  if (!invite) return fail(404, "no_invite");
  if (invite.claimed_at) return fail(409, "already_joined");

  const join = await newJoinToken();
  const { error } = await db().from("beyond_invites")
    .update({ token_hash: join.token_hash, expires_at: join.expires_at }).eq("email", invite.email);
  if (error) throw error;

  const emailError = await sendJoinLink(app, join.token, app.decision_note || "");
  await audit(actor, "resend-invite", app.email, { application: app.id, emailError });
  return ok({ emailError });
}

async function deleteApplication(actor: Actor, id: string): Promise<Reply> {
  const app = await loadApplication(id);
  if (!app) return fail(404, "not_found");
  // An accepted application's join link that nobody used yet must stop working;
  // a member who already joined stays (the invite just loses its link to the application)
  await db().from("beyond_invites").delete().eq("application_id", app.id).is("claimed_at", null);
  const { error } = await db().from("beyond_applications").delete().eq("id", app.id);
  if (error) throw error;
  await audit(actor, "delete-application", app.email, { application: app.id, role: app.role, status: app.status });
  return ok();
}

// A join link the admin hands over personally: no application, no email
async function createInvite(actor: Actor, email: string, role: string): Promise<Reply> {
  email = email.toLowerCase();
  if (email.length > 254 || !/^[^s@]+@[^s@]+.[^s@]+$/.test(email)) return fail(400, "invalid_email");
  if (role !== "mentor" && role !== "mentee") return fail(400, "invalid");
  const made = await freshInvite(actor, email, role, null);
  if ("status" in made) return made;
  await audit(actor, "create-invite", email, { role });
  return ok({ link: joinUrl(made.token), expiresAt: made.expires_at });
}

/* ---------------------------------------------------------------------------
   Members
   --------------------------------------------------------------------------- */
async function setMember(actor: Actor, id: string, role: string, status: string): Promise<Reply> {
  const changes: Record<string, string> = {};
  if (role) {
    if (!["mentor", "mentee", "admin"].includes(role)) return fail(400, "invalid");
    changes.role = role;
  }
  if (status) {
    if (!["approved", "suspended"].includes(status)) return fail(400, "invalid");
    changes.status = status;
  }
  if (!Object.keys(changes).length) return fail(400, "invalid");
  // So an admin can't lock themselves out
  if (id === actor.id && ((changes.role && changes.role !== "admin") || changes.status === "suspended")) {
    return fail(400, "self");
  }

  const { data: profile, error } = await db().from("beyond_profiles").update(changes).eq("id", id).select("id").maybeSingle();
  if (error) throw error;
  if (!profile) return fail(404, "not_found");

  const { data: user } = await db().auth.admin.getUserById(id);
  const email = (user && user.user && user.user.email || "").toLowerCase();
  if (email && changes.role) await db().from("beyond_invites").update({ role: changes.role }).eq("email", email);

  await audit(actor, "set-member", email || id, changes);
  return ok();
}

async function removeMember(actor: Actor, email: string): Promise<Reply> {
  email = email.toLowerCase();
  if (!email) return fail(400, "invalid");
  if (email === actor.email) return fail(400, "self");

  const userId = await userIdByEmail(email);
  let photos = 0;
  if (userId) {
    // Photos go through the Storage API (Supabase doesn't allow deleting them with SQL)
    const { data: files } = await db().storage.from(BUCKET).list(userId, { limit: 100 });
    const paths = (files || []).map((f) => userId + "/" + f.name);
    if (paths.length) {
      await db().storage.from(BUCKET).remove(paths);
      photos = paths.length;
    }
    const { error } = await db().from("beyond_profiles").delete().eq("id", userId);
    if (error) throw error;
  }
  await db().from("beyond_invites").delete().eq("email", email);

  await audit(actor, "remove-member", email, { photos });
  return ok();
}

/* ---------------------------------------------------------------------------
   Entry point
   --------------------------------------------------------------------------- */
Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const stop = guard(req, cors);
  if (stop) return stop;

  try {
    const actor = await currentAdmin(req);
    if (!actor) return json({ error: "not_admin" }, 403, cors);

    const body = await readJson(req);
    if (!body) return json({ error: "invalid" }, 400, cors);
    const id = str(body.id);
    const message = str(body.message).slice(0, 2000);

    let reply: Reply;
    switch (body.action) {
      case "accept":             reply = await accept(actor, id, message); break;
      case "reject":             reply = await reject(actor, id, body.notify === true, message); break;
      case "resend-invite":      reply = await resendInvite(actor, id); break;
      case "delete-application": reply = await deleteApplication(actor, id); break;
      case "create-invite":      reply = await createInvite(actor, str(body.email), str(body.role)); break;
      case "set-member":         reply = await setMember(actor, id, str(body.role), str(body.status)); break;
      case "remove-member":      reply = await removeMember(actor, str(body.email)); break;
      default:                   reply = fail(400, "unknown_action");
    }
    return json(reply.body, reply.status, cors);
  } catch (error) {
    console.error("beyond-admin failed", error);
    return json({ error: "server" }, 500, cors);
  }
});
