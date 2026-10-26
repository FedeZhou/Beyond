// Unit tests: beyond-join (the join link) and beyond-password-reset ("Forgot password?")
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { loadFunction, resetEnv, resetStore, store, addUser, addAdmin, sha256, SITE, menteeFields } from "../helpers/edge.mjs";

const apply = await loadFunction("beyond-apply");
const adminFn = await loadFunction("beyond-admin");
const join = await loadFunction("beyond-join");
const reset = await loadFunction("beyond-password-reset");
let token;

beforeEach(async () => {
  resetEnv(); resetStore();
  addAdmin("admin@example.com", "admin-token");
  await apply({ role: "mentee", fields: menteeFields("mia@example.com") });
  const app = store.tables.beyond_applications[0];
  await adminFn({ action: "accept", id: app.id }, { token: "admin-token" });
  token = /token=([A-Za-z0-9_-]+)/.exec(store.emails.at(-1).text)[1];
  store.emails = [];
});
const invite = () => store.tables.beyond_invites.find((i) => i.email === "mia@example.com");

describe("F-JOIN the join link (beyond-join)", () => {
  test("F-JOIN-01 check: greets by name, shows the email", async () => {
    const r = await join({ action: "check", token });
    assert.equal(r.status, 200);
    assert.deepEqual(r.data, { firstName: "Mia", email: "mia@example.com", accountExists: false });
  });
  test("F-JOIN-02 made-up, malformed or missing tokens: 404", async () => {
    assert.equal((await join({ action: "check", token: "x".repeat(43) })).data.error, "invalid_token");
    assert.equal((await join({ action: "check", token: "../../etc" })).status, 404);
    assert.equal((await join({ action: "check" })).status, 404);
  });
  test("F-JOIN-03 expired link: 410", async () => {
    invite().expires_at = new Date(Date.now() - 1000).toISOString();
    assert.equal((await join({ action: "check", token })).status, 410);
  });
  test("F-JOIN-04 claim: account created with the password, card pre-filled, link used up", async () => {
    const r = await join({ action: "claim", token, password: "a-long-password" });
    assert.equal(r.status, 200);
    assert.deepEqual(r.data, { ok: true, email: "mia@example.com", accountExists: false });
    const user = store.users.find((u) => u.email === "mia@example.com");
    assert.equal(user.password, "a-long-password");
    const card = store.tables.beyond_profiles.find((p) => p.id === user.id);
    assert.equal(card.first_name, "Mia");
    assert.deepEqual(card.studies, ["Politecnico di Milano, BSc Aerospace Engineering"]);
    assert.equal(card.onboarded_at, null);                               // not in the directory until saved
    assert.ok(invite().claimed_at);
    assert.equal((await join({ action: "check", token })).data.error, "used");
    assert.equal((await join({ action: "claim", token, password: "a-long-password" })).status, 409);
  });
  test("F-JOIN-05 passwords: at least 10 characters, at most 72 bytes", async () => {
    assert.equal((await join({ action: "claim", token, password: "short" })).data.error, "password");
    assert.equal((await join({ action: "claim", token, password: "é".repeat(40) })).data.error, "password");
    assert.equal((await join({ action: "claim", token })).data.error, "password");
    assert.equal(store.users.some((u) => u.email === "mia@example.com"), false);
  });
  test("F-JOIN-06 email already has an account (other app): password NOT changed", async () => {
    const existing = addUser("mia@example.com", { password: "their-other-app-password" });
    assert.equal((await join({ action: "check", token })).data.accountExists, true);
    const r = await join({ action: "claim", token, password: "a-new-password-here" });
    assert.deepEqual(r.data, { ok: true, email: "mia@example.com", accountExists: true });
    assert.equal(existing.password, "their-other-app-password");
    assert.ok(invite().claimed_at);
  });
  test("F-JOIN-07 unknown action: 400; other websites: 403", async () => {
    assert.equal((await join({ action: "steal", token })).status, 400);
    assert.equal((await join({ action: "check", token }, { origin: "https://evil.example" })).status, 403);
  });
  test("F-JOIN-08 at most 30 attempts an hour from one connection", async () => {
    for (let i = 0; i < 30; i++) await join({ action: "check", token: "x".repeat(43) });
    assert.equal((await join({ action: "check", token })).status, 429);
  });
  test("F-JOIN-09 the stored hash matches the emailed token (link can't be guessed from the database)", () => {
    assert.equal(invite().token_hash, sha256(token));
    assert.notEqual(invite().token_hash, token);
  });
});

describe("F-RESET forgot password (beyond-password-reset)", () => {
  let member;
  beforeEach(async () => {
    await join({ action: "claim", token, password: "a-long-password" });
    member = store.users.find((u) => u.email === "mia@example.com");
    store.emails = [];
  });
  test("F-RESET-01 a member gets an email with a link back to reset-password.html", async () => {
    const r = await reset({ email: " Mia@Example.com " });
    assert.deepEqual(r.data, { ok: true });
    const mail = store.emails.at(-1);
    assert.equal(mail.to[0], "mia@example.com");
    assert.equal(mail.subject, "Choose a new Beyond password");
    assert.match(mail.text, /Hi Mia,/);
    assert.match(mail.text, new RegExp("redirect_to=" + SITE.replace(/\./g, "\\.") + "/reset-password\\.html"));
  });
  test("F-RESET-02 unknown emails get the same answer and no email", async () => {
    assert.deepEqual((await reset({ email: "nobody@example.com" })).data, { ok: true });
    assert.equal(store.emails.length, 0);
  });
  test("F-RESET-03 accounts from the other app without a Beyond card get nothing", async () => {
    addUser("other-app@example.com");
    await reset({ email: "other-app@example.com" });
    assert.equal(store.emails.length, 0);
  });
  test("F-RESET-04 suspended members get nothing", async () => {
    store.tables.beyond_profiles.find((p) => p.id === member.id).status = "suspended";
    assert.deepEqual((await reset({ email: "mia@example.com" })).data, { ok: true });
    assert.equal(store.emails.length, 0);
  });
  test("F-RESET-05 invalid email: 400", async () => {
    assert.equal((await reset({ email: "not-an-email" })).status, 400);
    assert.equal((await reset({})).status, 400);
  });
  test("F-RESET-06 at most 3 emails an hour per address (same answer after that)", async () => {
    for (let i = 0; i < 3; i++) await reset({ email: "mia@example.com" }, { ip: "198.51.100." + i });
    assert.deepEqual((await reset({ email: "mia@example.com" }, { ip: "198.51.100.9" })).data, { ok: true });
    assert.equal(store.emails.length, 3);
  });
  test("F-RESET-07 at most 5 requests an hour from one connection", async () => {
    for (let i = 0; i < 5; i++) await reset({ email: `n${i}@example.com` });
    assert.equal((await reset({ email: "mia@example.com" })).status, 429);
  });
});
