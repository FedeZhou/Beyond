// Unit tests: the beyond-apply Edge Function (applications from the website)
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { loadFunction, resetEnv, resetStore, store, resend, ENV, SITE, ADMIN_EMAIL, menteeFields, mentorFields } from "../helpers/edge.mjs";

const apply = await loadFunction("beyond-apply");
const apps = () => store.tables.beyond_applications;
beforeEach(() => { resetEnv(); resetStore(); });

describe("F-APPLY applications (beyond-apply)", () => {
  test("F-APPLY-01 a mentee application is saved and both emails are sent", async () => {
    const r = await apply({ role: "mentee", fields: menteeFields("Mia@Example.com") });
    assert.equal(r.status, 200);
    assert.equal(r.data.ok, true);
    assert.equal(apps().length, 1);
    const a = apps()[0];
    assert.equal(a.email, "mia@example.com");
    assert.equal(a.role, "mentee");
    assert.equal(a.answers.programme, "BSc Aerospace Engineering");
    assert.match(a.ip_hash, /^[0-9a-f]{64}$/);                 // never the raw IP
    assert.ok(a.confirmation_sent_at && a.admin_notified_at);
    assert.equal(a.last_email_error, null);
    const [toAdmin, toApplicant] = [store.emails.find((e) => e.to[0] === ADMIN_EMAIL), store.emails.find((e) => e.to[0] === "mia@example.com")];
    assert.ok(toAdmin && toApplicant);
    assert.equal(toAdmin.reply_to, "mia@example.com");          // replying writes to the applicant
    assert.match(toAdmin.html, new RegExp(SITE.replace(/\./g, "\\.") + "/admin\\.html#application=" + a.id));
    assert.match(toApplicant.subject, /We received your Beyond application/);
  });
  test("F-APPLY-02 a mentor application is saved with its own questions", async () => {
    const r = await apply({ role: "mentor", fields: mentorFields() });
    assert.equal(r.status, 200);
    assert.equal(apps()[0].answers.linkedin, "https://www.linkedin.com/in/leo");
  });
  test("F-APPLY-03 wrong answers: 400 with the field names, nothing saved, no email", async () => {
    const r = await apply({ role: "mentee", fields: menteeFields("x@example.com", { goals: "short", consent: false }) });
    assert.equal(r.status, 400);
    assert.deepEqual(r.data, { error: "invalid", fields: ["goals", "consent"] });
    assert.equal(apps().length + store.emails.length, 0);
  });
  test("F-APPLY-04 bad requests are refused (role, body, JSON)", async () => {
    assert.equal((await apply({ role: "admin", fields: menteeFields() })).status, 400);
    assert.equal((await apply({ role: "mentee" })).status, 400);
    assert.equal((await apply(null, { raw: "not json" })).status, 400);
    assert.equal((await apply(null, { raw: JSON.stringify({ role: "mentee", fields: { x: "y".repeat(40000) } }) })).status, 400);
  });
  test("F-APPLY-05 a second pending application with the same email: 409 duplicate", async () => {
    await apply({ role: "mentee", fields: menteeFields() });
    const r = await apply({ role: "mentee", fields: menteeFields() });
    assert.equal(r.status, 409);
    assert.equal(r.data.error, "duplicate");
  });
  test("F-APPLY-06 spam trap filled: pretends OK, saves nothing, sends nothing", async () => {
    const r = await apply({ role: "mentee", fields: menteeFields(), honeypot: "http://spam" });
    assert.equal(r.status, 200);
    assert.equal(apps().length + store.emails.length, 0);
  });
  test("F-APPLY-07 only Beyond's website may call it (CORS)", async () => {
    assert.equal((await apply({ role: "mentee", fields: menteeFields() }, { origin: "https://evil.example" })).status, 403);
    assert.equal((await apply({ role: "mentee", fields: menteeFields() }, { origin: null })).status, 403);
    assert.equal((await apply(null, { method: "GET" })).status, 405);
    const pre = await apply(null, { method: "OPTIONS" });
    assert.equal(pre.status, 200);
    assert.equal(pre.headers.get("access-control-allow-origin"), SITE);
    assert.equal(apps().length, 0);
  });
  test("F-APPLY-08 Turnstile on: a failed check is refused before saving", async () => {
    ENV.BEYOND_TURNSTILE_SECRET = "secret";
    store.turnstileOk = false;
    const r = await apply({ role: "mentee", fields: menteeFields(), turnstileToken: "bad" });
    assert.equal(r.status, 400);
    assert.equal(r.data.error, "captcha");
    store.turnstileOk = true;
    assert.equal((await apply({ role: "mentee", fields: menteeFields(), turnstileToken: "" })).data.error, "captcha");
    assert.equal((await apply({ role: "mentee", fields: menteeFields(), turnstileToken: "good" })).status, 200);
  });
  test("F-APPLY-09 at most 5 applications an hour from one connection", async () => {
    for (let i = 0; i < 5; i++) assert.equal((await apply({ role: "mentee", fields: menteeFields(`p${i}@example.com`) })).status, 200);
    const r = await apply({ role: "mentee", fields: menteeFields("p9@example.com") });
    assert.equal(r.status, 429);
    assert.equal((await apply({ role: "mentee", fields: menteeFields("p9@example.com") }, { ip: "198.51.100.2" })).status, 200);
  });
  test("F-APPLY-10 at most 3 applications a day for one email", async () => {
    for (let i = 0; i < 3; i++) {
      await apply({ role: "mentee", fields: menteeFields("same@example.com") }, { ip: "198.51.100." + i });
      apps().forEach((a) => (a.status = "rejected"));
    }
    const r = await apply({ role: "mentee", fields: menteeFields("same@example.com") }, { ip: "198.51.100.9" });
    assert.equal(r.status, 429);
  });
  test("F-APPLY-11 if an email fails, the application is still saved and the problem noted", async () => {
    resend.failNext = { status: 500, body: { message: "down" } };
    const r = await apply({ role: "mentee", fields: menteeFields() });
    assert.equal(r.status, 200);
    assert.match(apps()[0].last_email_error, /Resend 500/);
  });
  test("F-APPLY-12 test applications (…@resend.dev) never notify the real admin inbox", async () => {
    await apply({ role: "mentee", fields: menteeFields("delivered+it@resend.dev") });
    assert.equal(store.emails.some((e) => e.to[0] === ADMIN_EMAIL), false);
    assert.ok(store.emails.every((e) => /@resend\.dev$/.test(e.to[0])));
  });
  test("F-APPLY-13 email safety caps: over the daily total nothing is sent, the application is still saved", async () => {
    store.limits["mail:day"] = 1000;
    const r = await apply({ role: "mentee", fields: menteeFields() });
    assert.equal(r.status, 200);
    assert.equal(store.emails.length, 0);
    assert.match(apps()[0].last_email_error, /emails a day/);
  });
  test("F-APPLY-14 database errors answer 500 without details", async () => {
    store.failInsert = { table: "beyond_applications", error: { code: "XX000", message: "boom" } };
    const r = await apply({ role: "mentee", fields: menteeFields() });
    assert.equal(r.status, 500);
    assert.deepEqual(r.data, { error: "server" });
  });
});
