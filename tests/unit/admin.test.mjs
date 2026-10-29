// Unit tests: the beyond-admin Edge Function (every change made in the admin portal)
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { loadFunction, resetEnv, resetStore, store, resend, addUser, addAdmin, sha256, SITE, menteeFields, mentorFields } from "../helpers/edge.mjs";

const apply = await loadFunction("beyond-apply");
const adminFn = await loadFunction("beyond-admin");
const T = "admin-token";
const act = (body, token = T) => adminFn(body, { token });
const table = (t) => store.tables[t];
const appFor = (email) => table("beyond_applications").find((a) => a.email === email);
const inviteFor = (email) => table("beyond_invites").find((i) => i.email === email);
const tokenFromEmail = (email) => {
  const e = store.emails.filter((m) => m.to[0] === email && /Welcome to Beyond/.test(m.subject)).at(-1);
  return e && /join\.html\?token=([A-Za-z0-9_-]+)/.exec(e.text)[1];
};
let admin;

beforeEach(async () => {
  resetEnv(); resetStore();
  admin = addAdmin("admin@example.com", T);
  await apply({ role: "mentee", fields: menteeFields("mia@example.com") });
  store.emails = [];
});

describe("F-ADM-AUTH who can use the admin actions", () => {
  test("F-ADM-AUTH-01 no login: 403", async () => {
    assert.equal((await adminFn({ action: "accept" })).status, 403);
  });
  test("F-ADM-AUTH-02 an invalid session: 403", async () => {
    assert.equal((await act({ action: "accept" }, "made-up")).data.error, "not_admin");
  });
  test("F-ADM-AUTH-03 a normal member: 403", async () => {
    store.tables.beyond_invites.push({ email: "m@example.com", role: "mentee" });
    addUser("m@example.com", { token: "member-token" });
    assert.equal((await act({ action: "accept", id: appFor("mia@example.com").id }, "member-token")).status, 403);
    assert.equal(appFor("mia@example.com").status, "pending");
  });
  test("F-ADM-AUTH-04 a suspended admin: 403", async () => {
    table("beyond_profiles").find((p) => p.id === admin.id).status = "suspended";
    assert.equal((await act({ action: "accept", id: appFor("mia@example.com").id })).status, 403);
  });
  test("F-ADM-AUTH-05 other websites: 403; unknown action: 400", async () => {
    assert.equal((await adminFn({ action: "accept" }, { token: T, origin: "https://evil.example" })).status, 403);
    assert.equal((await act({ action: "drop-tables" })).status, 400);
  });
});

describe("F-ADM-APP applications: accept, reject, resend, delete", () => {
  test("F-ADM-APP-01 accept: invite with hashed 14-day token, welcome email with join link, logged", async () => {
    const id = appFor("mia@example.com").id;
    const r = await act({ action: "accept", id, message: "Welcome!" });
    assert.equal(r.status, 200);
    assert.equal(r.data.emailError, null);
    const app = appFor("mia@example.com");
    assert.equal(app.status, "accepted");
    assert.equal(app.decision_note, "Welcome!");
    assert.equal(app.reviewed_by, admin.id);
    const inv = inviteFor("mia@example.com");
    const token = tokenFromEmail("mia@example.com");
    assert.ok(token, "join link in the email");
    assert.equal(inv.token_hash, sha256(token));                       // only the hash is stored
    const days = (new Date(inv.expires_at) - Date.now()) / 864e5;
    assert.ok(days > 13.9 && days <= 14);
    assert.ok(inv.sent_at);
    assert.equal(inv.role, "mentee");
    const mail = store.emails.at(-1);
    assert.match(mail.text, new RegExp(SITE.replace(/\./g, "\\.") + "/join\\.html\\?token="));
    assert.match(mail.text, /Welcome!/);
    assert.deepEqual(store.audit.at(-1), { actor_email: "admin@example.com", action: "accept", target: "mia@example.com", details: { application: id, role: "mentee", emailError: null } });
  });
  test("F-ADM-APP-02 accepting twice: 409", async () => {
    const id = appFor("mia@example.com").id;
    await act({ action: "accept", id });
    assert.equal((await act({ action: "accept", id })).data.error, "already_accepted");
  });
  test("F-ADM-APP-03 accepting someone who is already a member: 409 already_member", async () => {
    await act({ action: "accept", id: appFor("mia@example.com").id });
    inviteFor("mia@example.com").claimed_at = new Date().toISOString();
    await apply({ role: "mentor", fields: mentorFields("mia@example.com") });
    const r = await act({ action: "accept", id: table("beyond_applications").find((a) => a.role === "mentor").id });
    assert.equal(r.data.error, "already_member");
  });
  test("F-ADM-APP-04 accepting an email that already has an account (other app): card made and pre-filled at once", async () => {
    const existing = addUser("mia@example.com");
    await act({ action: "accept", id: appFor("mia@example.com").id });
    const card = table("beyond_profiles").find((p) => p.id === existing.id);
    assert.ok(card);
    assert.equal(card.first_name, "Mia");
    assert.equal(card.position, "BSc Aerospace Engineering");
    assert.equal(card.company, "Politecnico di Milano");
    assert.equal(card.role, "mentee");
  });
  test("F-ADM-APP-05 reject with a polite email and note", async () => {
    const id = appFor("mia@example.com").id;
    const r = await act({ action: "reject", id, notify: true, message: "Apply again next year" });
    assert.equal(r.status, 200);
    assert.equal(appFor("mia@example.com").status, "rejected");
    const mail = store.emails.at(-1);
    assert.equal(mail.subject, "Your Beyond application");
    assert.match(mail.text, /Apply again next year/);
  });
  test("F-ADM-APP-06 reject without email sends nothing; rejecting twice: 409", async () => {
    const id = appFor("mia@example.com").id;
    await act({ action: "reject", id, notify: false });
    assert.equal(store.emails.length, 0);
    assert.equal((await act({ action: "reject", id, notify: true })).data.error, "not_pending");
  });
  test("F-ADM-APP-07 resend join link: new token, new expiry, old link stops working", async () => {
    const id = appFor("mia@example.com").id;
    await act({ action: "accept", id });
    const oldHash = inviteFor("mia@example.com").token_hash;
    const r = await act({ action: "resend-invite", id });
    assert.equal(r.status, 200);
    assert.notEqual(inviteFor("mia@example.com").token_hash, oldHash);
    assert.equal(inviteFor("mia@example.com").token_hash, sha256(tokenFromEmail("mia@example.com")));
  });
  test("F-ADM-APP-08 resend: refused when not accepted or already joined", async () => {
    const id = appFor("mia@example.com").id;
    assert.equal((await act({ action: "resend-invite", id })).data.error, "not_accepted");
    await act({ action: "accept", id });
    inviteFor("mia@example.com").claimed_at = new Date().toISOString();
    assert.equal((await act({ action: "resend-invite", id })).data.error, "already_joined");
  });
  test("F-ADM-APP-09 delete: pending, rejected and accepted; an unused join link stops working", async () => {
    await apply({ role: "mentor", fields: mentorFields("leo@example.com") });
    assert.equal((await act({ action: "delete-application", id: appFor("leo@example.com").id })).status, 200);
    assert.equal(appFor("leo@example.com"), undefined);
    const id = appFor("mia@example.com").id;
    await act({ action: "accept", id });
    assert.ok(inviteFor("mia@example.com"));
    assert.equal((await act({ action: "delete-application", id })).status, 200);
    assert.equal(appFor("mia@example.com"), undefined);
    assert.equal(inviteFor("mia@example.com"), undefined, "unused join link removed");
  });
  test("F-ADM-APP-09b deleting the accepted application of someone who already joined keeps the invite", async () => {
    const id = appFor("mia@example.com").id;
    await act({ action: "accept", id });
    inviteFor("mia@example.com").claimed_at = new Date().toISOString();
    assert.equal((await act({ action: "delete-application", id })).status, 200);
    assert.ok(inviteFor("mia@example.com"));
  });
  test("F-ADM-APP-12 create-invite: a link without form or email; unusable twice; bad input refused; logged", async () => {
    const r = await act({ action: "create-invite", email: "Zed@Example.com", role: "mentor" });
    assert.equal(r.status, 200);
    const token = /token=([A-Za-z0-9_-]+)/.exec(r.data.link)[1];
    assert.ok(r.data.link.startsWith(SITE + "/join.html?token="));
    const inv = inviteFor("zed@example.com");
    assert.equal(inv.role, "mentor");
    assert.equal(inv.application_id ?? null, null);
    assert.equal(inv.token_hash, sha256(token));
    assert.equal(store.emails.length, 0);
    // A second link replaces the first
    const r2 = await act({ action: "create-invite", email: "zed@example.com", role: "mentee" });
    assert.notEqual(inviteFor("zed@example.com").token_hash, sha256(token));
    assert.equal(inviteFor("zed@example.com").role, "mentee");
    assert.equal(r2.status, 200);
    assert.equal((await act({ action: "create-invite", email: "nope", role: "mentor" })).data.error, "invalid_email");
    assert.equal((await act({ action: "create-invite", email: "a@example.com", role: "admin" })).status, 400);
    inviteFor("zed@example.com").claimed_at = new Date().toISOString();
    assert.equal((await act({ action: "create-invite", email: "zed@example.com", role: "mentor" })).data.error, "already_member");
    assert.ok(store.audit.some((l) => l.action === "create-invite" && l.target === "zed@example.com"));
  });
  test("F-ADM-APP-10 unknown or malformed ids: 404", async () => {
    assert.equal((await act({ action: "accept", id: "00000000-0000-0000-0000-000000000000" })).status, 404);
    assert.equal((await act({ action: "accept", id: "'; drop table x; --" })).status, 404);
  });
  test("F-ADM-APP-11 a failed welcome email is reported to the admin (so they can resend)", async () => {
    resend.failNext = { status: 500 };
    const r = await act({ action: "accept", id: appFor("mia@example.com").id });
    assert.equal(r.status, 200);
    assert.match(r.data.emailError, /Resend 500/);
    assert.equal(inviteFor("mia@example.com").sent_at, undefined);
  });
});

describe("F-ADM-MEM members: role, suspend, remove", () => {
  let member;
  beforeEach(async () => {
    await act({ action: "accept", id: appFor("mia@example.com").id });
    member = addUser("mia@example.com");
    store.files[member.id + "/avatar-1.jpg"] = true;
    store.files[member.id + "/avatar-2.jpg"] = true;
  });
  test("F-ADM-MEM-01 change role (card and invite)", async () => {
    assert.equal((await act({ action: "set-member", id: member.id, role: "mentor" })).status, 200);
    assert.equal(table("beyond_profiles").find((p) => p.id === member.id).role, "mentor");
    assert.equal(inviteFor("mia@example.com").role, "mentor");
  });
  test("F-ADM-MEM-02 suspend and reactivate", async () => {
    await act({ action: "set-member", id: member.id, status: "suspended" });
    assert.equal(table("beyond_profiles").find((p) => p.id === member.id).status, "suspended");
    await act({ action: "set-member", id: member.id, status: "approved" });
    assert.equal(table("beyond_profiles").find((p) => p.id === member.id).status, "approved");
  });
  test("F-ADM-MEM-03 invalid values and unknown members are refused", async () => {
    assert.equal((await act({ action: "set-member", id: member.id, role: "owner" })).status, 400);
    assert.equal((await act({ action: "set-member", id: member.id, status: "deleted" })).status, 400);
    assert.equal((await act({ action: "set-member", id: member.id })).status, 400);
    assert.equal((await act({ action: "set-member", id: "00000000-0000-0000-0000-000000000000", role: "mentor" })).status, 404);
  });
  test("F-ADM-MEM-04 an admin can't lock themselves out", async () => {
    assert.equal((await act({ action: "set-member", id: admin.id, role: "mentee" })).data.error, "self");
    assert.equal((await act({ action: "set-member", id: admin.id, status: "suspended" })).data.error, "self");
    assert.equal((await act({ action: "remove-member", email: "Admin@Example.com" })).data.error, "self");
  });
  test("F-ADM-MEM-05 remove: card, invite and photos deleted; the account is kept", async () => {
    const r = await act({ action: "remove-member", email: "mia@example.com" });
    assert.equal(r.status, 200);
    assert.equal(table("beyond_profiles").some((p) => p.id === member.id), false);
    assert.equal(inviteFor("mia@example.com"), undefined);
    assert.deepEqual(Object.keys(store.files), []);
    assert.ok(store.users.some((u) => u.id === member.id));                 // shared with the other app
    assert.deepEqual(store.audit.at(-1).details, { photos: 2 });
  });
});
