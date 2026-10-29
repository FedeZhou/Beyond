// Integration tests against the LIVE Supabase project: the whole journey
// (apply → accept → join → profile → directory → password → admin actions),
// with the real database rules, triggers, Edge Functions and Resend.
//
// SAFE BY DESIGN
//   - Every test person uses Resend's test inbox (delivered+…@resend.dev):
//     emails are accepted by Resend but never delivered to anyone, and the
//     "new application" notification of a test application is not sent to the
//     real admin inbox either. So no real inbox and no Gmail is ever involved.
//   - At most one run an hour and 4 a day (tests/integration/run.mjs checks
//     tests/.integration-runs.json; the tests refuse to run without it).
//   - Everything created is removed at the end, even when a test fails.
//
// Needs: the Supabase CLI logged in (npx supabase login) or SUPABASE_SERVICE_ROLE_KEY.
// Run before/after changing supabase/ (SQL or functions): npm run test:integration
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { SITE, liveConfig, serviceRoleKey, callFunction, cleanupTestData, TEST_EMAIL_LIKE } from "../helpers/live.mjs";

// Only through the launcher (npm run test:integration), which applies the run limit
const RUN = process.env.BEYOND_INTEGRATION_RUN;
const skip = RUN ? false : "start the integration tests with: npm run test:integration";
const email = (who) => `delivered+beyond-it-${RUN}-${who}@resend.dev`;
const PEOPLE = { mentee: email("mentee"), reject: email("reject"), admin: email("admin") };
const LIKE = TEST_EMAIL_LIKE;
const pw = () => "It-" + randomBytes(12).toString("base64url");
const sha256 = (t) => createHash("sha256").update(t).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let c, db, anonClient, state = {};
const signIn = async (who, password) => {
  const client = anonClient();
  const { data, error } = await client.auth.signInWithPassword({ email: PEOPLE[who], password });
  if (error) throw new Error("login " + who + ": " + error.message);
  return { client, token: data.session.access_token, id: data.user.id };
};
const admin = (body) => callFunction("beyond-admin", body, { token: state.adminToken });
const mentee = (extra = {}) => ({
  first_name: "Integra", last_name: "Mentee", email: PEOPLE.mentee, city: "Milan", country: "Italy",
  school: "Politecnico di Milano", programme: "BSc Aerospace Engineering", gpa: "28/30", field: "Engineering", field_other: "",
  goals: "An MSc abroad, then the space industry, with a mentor's help.", achievement: "A regional physics olympiad, won while working.",
  consent: true, ...extra,
});

describe("INT the whole journey on the live backend", { skip, concurrency: false }, () => {
  before(async () => {
    c = await liveConfig();
    db = createClient(c.supabaseUrl, serviceRoleKey(c.ref), { auth: { persistSession: false, autoRefreshToken: false } });
    anonClient = () => createClient(c.supabaseUrl, c.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  });

  after(async () => {
    if (db) assert.equal(await cleanupTestData(db), 0, "test data cleaned up");
  });

  test("INT-01 apply: saved, both emails sent, duplicate refused", async () => {
    let r = await callFunction("beyond-apply", { role: "mentee", fields: mentee() });
    assert.equal(r.status, 200, JSON.stringify(r));
    r = await callFunction("beyond-apply", { role: "mentee", fields: mentee() });
    assert.equal(r.data.error, "duplicate");
    await sleep(1000);
    const { data: app } = await db.from("beyond_applications").select("*").eq("email", PEOPLE.mentee).single();
    assert.equal(app.status, "pending");
    assert.match(app.ip_hash, /^[0-9a-f]{64}$/);
    assert.ok(app.confirmation_sent_at && app.admin_notified_at, "emails sent: " + app.last_email_error);
    state.menteeApp = app.id;
  });

  test("INT-02 database rules: visitors see nothing", async () => {
    const v = anonClient();
    assert.equal(((await v.from("beyond_applications").select("id")).data || []).length, 0);
    assert.equal(((await v.from("beyond_profiles").select("id")).data || []).length, 0);
    assert.ok((await v.rpc("beyond_admin_list_members")).error);
  });

  test("INT-03 a test admin: the invite trigger gives an admin card; RLS lets admins read", async () => {
    state.adminPassword = pw();
    await db.from("beyond_invites").insert({ email: PEOPLE.admin, role: "admin" });
    const { data, error } = await db.auth.admin.createUser({ email: PEOPLE.admin, password: state.adminPassword, email_confirm: true });
    assert.ifError(error);
    const { data: card } = await db.from("beyond_profiles").select("role, status").eq("id", data.user.id).single();
    assert.deepEqual(card, { role: "admin", status: "approved" });
    const A = await signIn("admin", state.adminPassword);
    state.adminToken = A.token; state.adminId = A.id;
    assert.equal((await A.client.rpc("beyond_is_admin")).data, true);
    assert.equal(((await A.client.from("beyond_applications").select("id").eq("id", state.menteeApp)).data || []).length, 1);
    assert.ok(!(await A.client.rpc("beyond_admin_list_members")).error);
  });

  test("INT-04 accept: hashed 14-day invite, welcome email sent, logged; resend makes a new link", async () => {
    const r = await admin({ action: "accept", id: state.menteeApp, message: "Integration test" });
    assert.deepEqual(r.data, { ok: true, emailError: null });
    const { data: inv } = await db.from("beyond_invites").select("*").eq("email", PEOPLE.mentee).single();
    assert.match(inv.token_hash, /^[0-9a-f]{64}$/);
    assert.ok((new Date(inv.expires_at) - Date.now()) / 864e5 > 13.9);
    assert.ok(inv.sent_at);
    const { data: log } = await db.from("beyond_audit_log").select("action").eq("target", PEOPLE.mentee);
    assert.ok(log.some((l) => l.action === "accept"));
    // Resend join link: a new token (the old link stops working)
    assert.deepEqual((await admin({ action: "resend-invite", id: state.menteeApp })).data, { ok: true, emailError: null });
    const { data: again } = await db.from("beyond_invites").select("token_hash").eq("email", PEOPLE.mentee).single();
    assert.notEqual(again.token_hash, inv.token_hash);
    // The real link is in an email nobody receives: give the invite a token we know
    state.token = randomBytes(32).toString("base64url");
    await db.from("beyond_invites").update({ token_hash: sha256(state.token) }).eq("email", PEOPLE.mentee);
  });

  test("INT-05 join: account created, card pre-filled by the trigger, link used up", async () => {
    let r = await callFunction("beyond-join", { action: "check", token: state.token });
    assert.deepEqual(r.data, { firstName: "Integra", email: PEOPLE.mentee, accountExists: false });
    state.memberPassword = pw();
    r = await callFunction("beyond-join", { action: "claim", token: state.token, password: state.memberPassword });
    assert.deepEqual(r.data, { ok: true, email: PEOPLE.mentee, accountExists: false });
    assert.equal((await callFunction("beyond-join", { action: "check", token: state.token })).data.error, "used");
    const M = await signIn("mentee", state.memberPassword);
    state.memberId = M.id;
    const { data: me } = await M.client.from("beyond_profiles").select("*").eq("id", M.id).single();
    assert.equal(me.first_name, "Integra");
    assert.equal(me.position, "BSc Aerospace Engineering");
    assert.equal(me.company, "Politecnico di Milano");
    assert.deepEqual(me.studies, ["Politecnico di Milano, BSc Aerospace Engineering"]);
    assert.equal(me.onboarded_at, null);
  });

  test("INT-06 first save works at once (with a photo); the rate limit applies afterwards", async () => {
    const M = await signIn("mentee", state.memberPassword);
    const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=", "base64");
    const path = M.id + "/avatar-" + Date.now() + ".jpg";
    assert.ifError((await M.client.storage.from("beyond-avatars").upload(path, jpeg, { contentType: "image/jpeg" })).error);
    assert.ok((await M.client.storage.from("beyond-avatars").upload(state.adminId + "/x.jpg", jpeg, { contentType: "image/jpeg" })).error, "not into someone else's folder");
    const u = await M.client.from("beyond_profiles").update({ photo_path: path, experience: ["Lab assistant"] }).eq("id", M.id).select("onboarded_at").single();
    assert.ifError(u.error);
    assert.ok(u.data.onboarded_at);
    const again = await M.client.from("beyond_profiles").update({ city: "Turin" }).eq("id", M.id);
    assert.match(again.error && again.error.message, /rate_limited/);
    assert.ok((await M.client.from("beyond_profiles").update({ role: "admin" }).eq("id", M.id)).error, "can't make themselves admin");
  });

  test("INT-07 directory: another member sees the card; hidden cards disappear", async () => {
    await db.from("beyond_profiles").update({ role: "mentor", first_name: "Other", onboarded_at: new Date().toISOString() }).eq("id", state.adminId);
    try {
      const O = await signIn("admin", state.adminPassword);
      const seen = async () => ((await O.client.from("beyond_profiles").select("id").eq("id", state.memberId)).data || []).length;
      assert.equal(await seen(), 1);
      assert.equal(((await O.client.from("beyond_applications").select("id")).data || []).length, 0, "normal members can't read applications");
      assert.equal((await callFunction("beyond-admin", { action: "accept", id: state.menteeApp }, { token: O.token })).data.error, "not_admin");
      await sleep(3500);
      const M = await signIn("mentee", state.memberPassword);
      await M.client.from("beyond_profiles").update({ is_listed: false }).eq("id", state.memberId);
      assert.equal(await seen(), 0);
    } finally {
      await db.from("beyond_profiles").update({ role: "admin", onboarded_at: null }).eq("id", state.adminId);
    }
  });

  test("INT-08 forgot password: the function answers; the link lands on reset-password.html; the new password works", async () => {
    assert.deepEqual((await callFunction("beyond-password-reset", { email: PEOPLE.mentee })).data, { ok: true });
    // The emailed link goes to a test inbox: make an identical link to check where it leads
    const { data, error } = await db.auth.admin.generateLink({ type: "recovery", email: PEOPLE.mentee, options: { redirectTo: SITE + "/reset-password.html" } });
    assert.ifError(error);
    const res = await fetch(data.properties.action_link, { redirect: "manual" });
    const location = res.headers.get("location") || "";
    assert.ok(location.startsWith(SITE + "/reset-password.html#access_token="), "Supabase Redirect URLs include the site: " + location.slice(0, 60));
    const access = /access_token=([^&]+)/.exec(location)[1];
    const newPassword = pw();
    const put = await fetch(`${c.supabaseUrl}/auth/v1/user`, { method: "PUT", headers: { apikey: c.supabaseAnonKey, Authorization: "Bearer " + access, "Content-Type": "application/json" }, body: JSON.stringify({ password: newPassword }) });
    assert.equal(put.status, 200);
    await signIn("mentee", newPassword);
    state.memberPassword = newPassword;
  });


  test("INT-09 reject with email, can't reject twice, rejected can be deleted", async () => {
    assert.equal((await callFunction("beyond-apply", { role: "mentee", fields: mentee({ email: PEOPLE.reject, first_name: "Rejecta" }) })).status, 200);
    await sleep(1000);
    const { data: app } = await db.from("beyond_applications").select("id").eq("email", PEOPLE.reject).single();
    assert.deepEqual((await admin({ action: "reject", id: app.id, notify: true, message: "Integration test" })).data, { ok: true, emailError: null });
    assert.equal((await admin({ action: "reject", id: app.id })).data.error, "not_pending");
    assert.equal((await admin({ action: "delete-application", id: app.id })).status, 200);
  });

  test("INT-10 members: suspend, reactivate, role, self-protection, remove (account kept)", async () => {
    assert.equal((await admin({ action: "set-member", id: state.memberId, status: "suspended" })).status, 200);
    const M = await signIn("mentee", state.memberPassword);
    assert.equal((await M.client.from("beyond_profiles").select("status").eq("id", state.memberId).single()).data.status, "suspended");
    assert.equal(((await M.client.from("beyond_profiles").select("id").neq("id", state.memberId)).data || []).length, 0, "suspended: no directory");
    assert.equal((await admin({ action: "set-member", id: state.memberId, status: "approved" })).status, 200);
    assert.equal((await admin({ action: "set-member", id: state.memberId, role: "mentor" })).status, 200);
    assert.equal((await db.from("beyond_invites").select("role").eq("email", PEOPLE.mentee).single()).data.role, "mentor");
    assert.equal((await admin({ action: "set-member", id: state.adminId, role: "mentee" })).data.error, "self");
        assert.equal((await admin({ action: "remove-member", email: PEOPLE.mentee })).status, 200);
    assert.equal((await db.from("beyond_profiles").select("id").eq("id", state.memberId)).data.length, 0);
    assert.equal(((await db.storage.from("beyond-avatars").list(state.memberId)).data || []).length, 0);
    assert.ok((await db.auth.admin.getUserById(state.memberId)).data.user, "the account itself is kept");
  });

  test("INT-11 every admin action is in the activity log", async () => {
    const { data } = await db.from("beyond_audit_log").select("action").like("target", LIKE);
    const actions = new Set(data.map((l) => l.action));
    for (const a of ["accept", "resend-invite", "reject", "delete-application", "set-member", "remove-member"]) assert.ok(actions.has(a), a);
  });
});
