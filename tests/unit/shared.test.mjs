// Unit tests: supabase/functions/_shared/ (validation, emails, HTTP helpers, caps)
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { FUNCTIONS, ENV, resetEnv, store, resetStore, resend, menteeFields, mentorFields, ADMIN_EMAIL } from "../helpers/edge.mjs";

const load = (p) => import(new URL("_shared/" + p, FUNCTIONS).href);
const { parseApplication, answerList, isRole } = await load("application.ts");
const T = await load("templates.ts");
const http = await load("http.ts");
const { env, siteUrl, JOIN_LINK_DAYS } = await load("env.ts");
const mail = await load("mail.ts");
const { passesTurnstile } = await load("turnstile.ts");

beforeEach(() => { resetEnv(); resetStore(); });

describe("U-APP application answers (application.ts)", () => {
  test("U-APP-01 a complete mentee application is accepted and cleaned", () => {
    const r = parseApplication("mentee", menteeFields("  Mia@Example.COM ", { first_name: "  Mia   Lin ", goals: "Line one is long enough here.\r\nLine two." }));
    assert.equal(r.ok, true);
    assert.equal(r.application.email, "mia@example.com");
    assert.equal(r.application.first_name, "Mia Lin");                      // spaces collapsed
    assert.equal(r.application.answers.goals, "Line one is long enough here.\nLine two.");  // line breaks kept
    assert.equal(r.application.answers.school, "Politecnico di Milano");
  });
  test("U-APP-02 a complete mentor application is accepted", () => {
    const r = parseApplication("mentor", mentorFields());
    assert.equal(r.ok, true);
    assert.deepEqual(Object.keys(r.application.answers).sort(), ["company", "field", "highest_degree", "linkedin", "motivation", "position"]);
  });
  test("U-APP-03 every missing required answer is reported", () => {
    const r = parseApplication("mentee", {});
    assert.equal(r.ok, false);
    for (const f of ["first_name", "last_name", "email", "city", "country", "school", "programme", "gpa", "field", "goals", "achievement", "age_confirmed", "consent"]) {
      assert.ok(r.invalid.includes(f), f);
    }
  });
  test("U-APP-04 18+ and consent must be ticked (true, not 'yes')", () => {
    const r = parseApplication("mentee", menteeFields(undefined, { age_confirmed: "yes", consent: false }));
    assert.deepEqual(r.invalid.sort(), ["age_confirmed", "consent"]);
  });
  test("U-APP-05 'Other' needs an explanation; otherwise the explanation is dropped", () => {
    assert.deepEqual(parseApplication("mentor", mentorFields(undefined, { field: "Other", field_other: "" })).invalid, ["field_other"]);
    const ok = parseApplication("mentor", mentorFields(undefined, { field: "Other", field_other: "Quantum" }));
    assert.equal(ok.application.answers.field_other, "Quantum");
    const dropped = parseApplication("mentor", mentorFields(undefined, { field: "Physics", field_other: "leftover" }));
    assert.equal("field_other" in dropped.application.answers, false);
  });
  test("U-APP-06 lengths are enforced (too short and too long)", () => {
    assert.deepEqual(parseApplication("mentee", menteeFields(undefined, { goals: "too short" })).invalid, ["goals"]);
    assert.deepEqual(parseApplication("mentee", menteeFields(undefined, { first_name: "x".repeat(61) })).invalid, ["first_name"]);
    assert.deepEqual(parseApplication("mentor", mentorFields(undefined, { motivation: "y".repeat(3001) })).invalid, ["motivation"]);
  });
  test("U-APP-07 email and LinkedIn must be real addresses (no javascript: links)", () => {
    assert.deepEqual(parseApplication("mentee", menteeFields("not-an-email")).invalid, ["email"]);
    for (const bad of ["javascript:alert(1)", "ftp://x.com", "linkedin.com/in/x"]) {
      assert.deepEqual(parseApplication("mentor", mentorFields(undefined, { linkedin: bad })).invalid, ["linkedin"], bad);
    }
  });
  test("U-APP-08 answers that are not text are refused", () => {
    assert.ok(parseApplication("mentee", menteeFields(undefined, { city: { $ne: "" } })).invalid.includes("city"));
  });
  test("U-APP-09 unknown extra fields are ignored", () => {
    const r = parseApplication("mentee", menteeFields(undefined, { "cf-turnstile-response": "x", admin: true }));
    assert.equal(r.ok, true);
    assert.equal("admin" in r.application.answers, false);
  });
  test("U-APP-10 isRole only allows mentor and mentee", () => {
    assert.equal(isRole("mentor"), true);
    assert.equal(isRole("mentee"), true);
    assert.equal(isRole("admin"), false);
  });
  test("U-APP-11 answerList: labels in form order, empty answers left out", () => {
    const app = parseApplication("mentee", menteeFields()).application;
    const labels = answerList(app).map((a) => a.label);
    assert.deepEqual(labels.slice(0, 5), ["Name", "Surname", "Email", "City", "Country"]);
    assert.ok(labels.indexOf("School or university") < labels.indexOf("Proudest achievement"));
    assert.equal(labels.includes("Field of interest (more)"), false);
  });
});

describe("U-TPL email templates (templates.ts)", () => {
  const app = parseApplication("mentee", menteeFields("mia@example.com", { first_name: "<b>Mia</b>", goals: 'Goals with <script>alert(1)</script> and "quotes".' })).application;
  const all = () => [
    T.applicantConfirmation(app), T.adminNotification(app, "https://beyondicmc.com/admin.html#application=1"),
    T.acceptance(app, "https://beyondicmc.com/join.html?token=abc", "A <i>note</i>"), T.rejection(app, "Sorry <3"),
    T.passwordReset("<Mia>", "https://x.supabase.co/auth/v1/verify?token=t&type=recovery"),
  ];
  test("U-TPL-01 every email has a subject, HTML and plain text", () => {
    for (const m of all()) {
      assert.ok(m.subject && m.html.startsWith("<!doctype html>") && m.text.length > 20, m.subject);
    }
  });
  test("U-TPL-02 nothing typed by a visitor can inject HTML", () => {
    for (const m of all()) {
      assert.equal(/<script>|<b>Mia|<i>note|<Mia>/.test(m.html), false, m.subject);
    }
    assert.match(T.applicantConfirmation(app).html, /&lt;script&gt;/);
  });
  test("U-TPL-03 confirmation lists every answer", () => {
    const m = T.applicantConfirmation(app);
    for (const a of answerList(app)) assert.ok(m.text.includes(a.label + ":\n" + a.value), a.label);
  });
  test("U-TPL-04 admin notification names the person and links to the portal", () => {
    const m = T.adminNotification(app, "https://beyondicmc.com/admin.html#application=1");
    assert.match(m.subject, /^New mentee application: /);
    assert.match(m.html, /admin\.html#application=1/);
  });
  test("U-TPL-05 welcome email: join link, 14 days, optional note", () => {
    const withNote = T.acceptance(app, "https://beyondicmc.com/join.html?token=abc", "Welcome!");
    assert.match(withNote.text, /Join Beyond: https:\/\/beyondicmc\.com\/join\.html\?token=abc/);
    assert.match(withNote.text, new RegExp(JOIN_LINK_DAYS + " days"));
    assert.match(withNote.text, /Welcome!/);
    assert.doesNotMatch(T.acceptance(app, "https://x/join", "").text, /\n\n\n/);
  });
  test("U-TPL-06 rejection is polite, note optional", () => {
    assert.match(T.rejection(app, "").text, /not able to offer you a place/);
    assert.match(T.rejection(app, "Try again next year").text, /Try again next year/);
  });
  test("U-TPL-07 password reset email contains the link", () => {
    const m = T.passwordReset("Mia", "https://x.supabase.co/auth/v1/verify?token=t");
    assert.match(m.text, /Hi Mia,/);
    assert.match(m.text, /verify\?token=t/);
    assert.match(T.passwordReset("", "https://x").text, /^Hi,/);
  });
});

describe("U-HTTP request helpers (http.ts, env.ts)", () => {
  const req = (method, origin, body) => new Request("https://f/x", { method, headers: origin ? { Origin: origin } : {}, body });
  test("U-HTTP-01 CORS: only the website's addresses are allowed", () => {
    assert.equal(http.corsHeaders(req("POST", "https://beyondicmc.com"))["Access-Control-Allow-Origin"], "https://beyondicmc.com");
    assert.equal(http.corsHeaders(req("POST", "https://evil.example"))["Access-Control-Allow-Origin"], undefined);
  });
  test("U-HTTP-02 guard: preflight OK, only POST, only from the website", async () => {
    const cors = {};
    assert.equal(http.guard(req("OPTIONS", "https://beyondicmc.com"), cors).status, 200);
    assert.equal(http.guard(req("GET", "https://beyondicmc.com"), cors).status, 405);
    assert.equal(http.guard(req("POST", "https://evil.example", "{}"), cors).status, 403);
    assert.equal(http.guard(req("POST", null, "{}"), cors).status, 403);
    assert.equal(http.guard(req("POST", "https://beyondicmc.com", "{}"), cors), null);
  });
  test("U-HTTP-03 readJson: objects only, size limited", async () => {
    assert.deepEqual(await http.readJson(req("POST", "x", '{"a":1}')), { a: 1 });
    assert.equal(await http.readJson(req("POST", "x", "[1,2]")), null);
    assert.equal(await http.readJson(req("POST", "x", "not json")), null);
    assert.equal(await http.readJson(req("POST", "x", JSON.stringify({ a: "x".repeat(40000) }))), null);
  });
  test("U-HTTP-04 join tokens are long, URL-safe and unique", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => http.randomToken()));
    assert.equal(tokens.size, 200);
    for (const t of tokens) assert.match(t, /^[A-Za-z0-9_-]{43}$/);
  });
  test("U-HTTP-05 sha256 and IP hashing (salted, never the raw address)", async () => {
    assert.equal(await http.sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const r = new Request("https://f/x", { headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" } });
    assert.equal(http.clientIp(r), "203.0.113.7");
    const a = await http.ipHash(r);
    ENV.BEYOND_IP_SALT = "other";
    assert.notEqual(await http.ipHash(r), a);
    assert.doesNotMatch(a, /203/);
  });
  test("U-HTTP-06 settings: missing secrets fail clearly, site address without trailing slash", () => {
    assert.throws(() => env("BEYOND_NOT_SET"), /Missing secret BEYOND_NOT_SET/);
    assert.equal(env("BEYOND_NOT_SET", "fallback"), "fallback");
    ENV.BEYOND_SITE_URL = "https://beyondicmc.com//";
    assert.equal(siteUrl(), "https://beyondicmc.com");
  });
});

describe("U-MAIL sending and safety caps (mail.ts)", () => {
  const msg = { subject: "S", html: "<p>h</p>", text: "t" };
  test("U-MAIL-01 sends through Resend as Beyond <info@beyondicmc.com>, replies to info@", async () => {
    assert.equal(await mail.trySend("mia@example.com", msg), null);
    const e = store.emails[0];
    assert.equal(e.from, "Beyond <info@beyondicmc.com>");
    assert.deepEqual(e.to, ["mia@example.com"]);
    assert.equal(e.reply_to, "info@beyondicmc.com");
    assert.equal(await mail.trySend("x@example.com", msg, "mia@example.com"), null);
    assert.equal(store.emails[1].reply_to, "mia@example.com");
  });
  test(`U-MAIL-02 at most ${mail.MAX_PER_RECIPIENT_DAY} emails a day to the same address`, async () => {
    for (let i = 0; i < mail.MAX_PER_RECIPIENT_DAY; i++) assert.equal(await mail.trySend("Mia@Example.com", msg), null);
    assert.match(await mail.trySend("mia@example.com", msg), /daily limit of 5 emails to mia@example\.com/);
    assert.equal(store.emails.length, mail.MAX_PER_RECIPIENT_DAY);
  });
  test("U-MAIL-03 the admin address is only held to the totals", async () => {
    for (let i = 0; i < 12; i++) assert.equal(await mail.trySend(ADMIN_EMAIL, msg), null);
  });
  test(`U-MAIL-04 at most ${mail.MAX_PER_HOUR} emails an hour and ${mail.MAX_PER_DAY} a day in total`, async () => {
    for (let i = 0; i < mail.MAX_PER_HOUR; i++) await mail.trySend(`p${i}@example.com`, msg);
    assert.match(await mail.trySend("one-more@example.com", msg), /emails an hour/);
    store.limitOverride["mail:hour"] = true;
    store.limits["mail:day"] = mail.MAX_PER_DAY;
    assert.match(await mail.trySend("another@example.com", msg), /emails a day/);
    assert.equal(store.emails.length, mail.MAX_PER_HOUR);
  });
  test("U-MAIL-05 caps are below the Resend free plan (100/day)", () => {
    assert.ok(mail.MAX_PER_DAY <= 100 && mail.MAX_PER_HOUR <= mail.MAX_PER_DAY && mail.MAX_PER_RECIPIENT_DAY <= 10);
  });
  test("U-MAIL-06 a Resend error is returned, never thrown", async () => {
    resend.failNext = { status: 422, body: { message: "bad from" } };
    assert.match(await mail.trySend("mia@example.com", msg), /Resend 422/);
  });
  test("U-MAIL-07 Resend test addresses are recognised", () => {
    assert.equal(mail.isTestAddress("delivered+x@resend.dev"), true);
    assert.equal(mail.isTestAddress("mia@example.com"), false);
  });
});

describe("U-TS spam check (turnstile.ts)", () => {
  test("U-TS-01 without a secret the check is skipped", async () => {
    assert.equal(await passesTurnstile("", "1.2.3.4"), true);
  });
  test("U-TS-02 with a secret: no token fails, Cloudflare decides otherwise", async () => {
    ENV.BEYOND_TURNSTILE_SECRET = "secret";
    assert.equal(await passesTurnstile("", "1.2.3.4"), false);
    assert.equal(await passesTurnstile("token", "1.2.3.4"), true);
    store.turnstileOk = false;
    assert.equal(await passesTurnstile("token", "1.2.3.4"), false);
  });
});
