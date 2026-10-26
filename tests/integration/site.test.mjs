// Live browser tests: the REAL website (https://beyondicmc.com) and the REAL
// backend, clicked through in a real browser, like a person would:
// mentee and mentor forms → admin portal (login, accept) → join link →
// My profile with a photo → directory → forgot password → log out.
//
// Same safety rules as flow.test.mjs: every test person is a Resend test
// address (never delivered), runs are limited by the launcher, and everything
// created is deleted at the end.
// Start with: npm run test:integration
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { SITE, liveConfig, serviceRoleKey, cleanupTestData } from "../helpers/live.mjs";
import { launch, newPage, navText } from "../helpers/browser.mjs";
import { content } from "../helpers/repo.mjs";

const RUN = process.env.BEYOND_INTEGRATION_RUN;
const skip = RUN ? false : "start the integration tests with: npm run test:integration";
const turnstileOn = !!content().applications.turnstileSiteKey;
const email = (who) => `delivered+beyond-it-${RUN}-ui-${who}@resend.dev`;
const PEOPLE = { mentee: email("mentee"), mentor: email("mentor"), admin: email("admin") };
const T = content().strings.en.members;
const pw = () => "Ui-" + randomBytes(12).toString("base64url");

let db, browser, state = {};
const page = async (opts) => newPage(browser, opts);
const shown = (p, sel, timeout = 20000) => p.waitForSelector(sel + ":not([hidden])", { timeout });
async function login(p, who, password) {
  await p.goto(SITE + "/login.html");
  await shown(p, "#members-signin");
  await p.fill("#signin-email", PEOPLE[who]);
  await p.fill("#signin-password", password);
  await p.click("#signin-form button[type=submit]");
}

describe("LIVE the real website, clicked through", { skip, concurrency: false }, () => {
  before(async () => {
    const c = await liveConfig();
    db = createClient(c.supabaseUrl, serviceRoleKey(c.ref), { auth: { persistSession: false, autoRefreshToken: false } });
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
    if (db) assert.equal(await cleanupTestData(db), 0, "test data cleaned up");
  });

  test("LIVE-01 'Become a mentee': the form is sent, saved, and both emails go out", { skip: turnstileOn && "the Turnstile check is on: forms can't be sent by a robot (as intended)" }, async () => {
    const p = await page();
    await p.goto(SITE + "/mentee.html");
    await p.fill("#first-name", "Live"); await p.fill("#last-name", "Mentee"); await p.fill("#email", PEOPLE.mentee);
    await p.fill("#city", "Milan"); await p.fill("#country", "Italy");
    await p.fill("#school", "Università di Bologna"); await p.fill("#programme", "BSc Physics, 2nd year"); await p.fill("#gpa", "29/30");
    await p.selectOption("#field", "Physics");
    await p.fill("#goals", "A PhD abroad, with advice from someone who has done it.");
    await p.fill("#achievement", "Building a telescope from spare parts with my grandfather.");
    if (await p.locator("#age").count()) await p.check("#age");   // older pages had a separate 18+ box
    await p.check("#consent");
    await p.click("form[data-form] button[type=submit]");
    await shown(p, "#mentee-thanks");
    assert.deepEqual(p.errors, []);
    await p.context().close();
    await new Promise((r) => setTimeout(r, 1500));
    const { data: app } = await db.from("beyond_applications").select("*").eq("email", PEOPLE.mentee).single();
    assert.equal(app.role, "mentee");
    assert.equal(app.answers.school, "Università di Bologna");
    assert.ok(app.confirmation_sent_at && app.admin_notified_at, "emails: " + app.last_email_error);
  });

  test("LIVE-02 'Become a mentor' (with 'Other'): sent, saved, both emails go out", { skip: turnstileOn && "Turnstile is on" }, async () => {
    const p = await page();
    await p.goto(SITE + "/mentor.html");
    await p.fill("#first-name", "Live"); await p.fill("#last-name", "Mentor"); await p.fill("#email", PEOPLE.mentor);
    await p.fill("#city", "Zurich"); await p.fill("#country", "Switzerland");
    await p.fill("#company", "ETH Zurich"); await p.fill("#position", "Researcher");
    await p.selectOption("#field", "Other"); await p.fill("#field-other", "Quantum computing");
    await p.fill("#highest-degree", "ETH Zurich, PhD Physics"); await p.fill("#linkedin", "https://www.linkedin.com/in/example");
    await p.fill("#motivation", "I want to be the role model I never had growing up.");
    if (await p.locator("#age").count()) await p.check("#age");   // older pages had a separate 18+ box
    await p.check("#consent");
    await p.click("form[data-form] button[type=submit]");
    await shown(p, "#mentor-thanks");
    assert.deepEqual(p.errors, []);
    await p.context().close();
    await new Promise((r) => setTimeout(r, 1500));
    const { data: app } = await db.from("beyond_applications").select("*").eq("email", PEOPLE.mentor).single();
    assert.equal(app.answers.field_other, "Quantum computing");
    assert.ok(app.confirmation_sent_at && app.admin_notified_at, "emails: " + app.last_email_error);
    state.mentorApp = app.id;
  });

  test("LIVE-03 admin: logs in, fills their profile, opens the portal, accepts the mentor", { skip: turnstileOn && "needs LIVE-02" }, async () => {
    state.adminPassword = pw();
    await db.from("beyond_invites").insert({ email: PEOPLE.admin, role: "admin" });
    assert.ifError((await db.auth.admin.createUser({ email: PEOPLE.admin, password: state.adminPassword, email_confirm: true })).error);
    const p = await page();
    await login(p, "admin", "wrong-password-1");
    await shown(p, "#signin-status");
    assert.equal(await p.locator("#signin-status").innerText(), T.signInWrong, "wrong password: clear message");
    await p.fill("#signin-password", state.adminPassword);
    await p.click("#signin-form button[type=submit]");
    await p.waitForURL(/my-card\.html/, { timeout: 20000 });
    await shown(p, "#card-editor");
    assert.equal(await navText(p), "Home About Become a mentor Become a mentee Directory My profile");
    await p.fill("#first-name", "Live"); await p.fill("#last-name", "Admin"); await p.fill("#city", "Milan"); await p.fill("#country", "Italy");
    await p.fill("#position", "Beyond team"); await p.locator('[data-line="studies"]').first().fill("Politecnico di Milano");
    await p.click("#card-form button[type=submit]");
    await shown(p, "#card-done");
    await p.click("#card-done");
    await shown(p, "#members-directory");
    await p.click("[data-admin-link]");
    await shown(p, "#admin-app");
    const row = p.locator("#app-rows tr", { hasText: "Live Mentor" });
    assert.equal(await row.count(), 1, "the new application is in Pending");
    await row.locator("[data-open]").click();
    await shown(p, "#app-detail");
    assert.match(await p.locator("#app-detail").innerText(), /Quantum computing/);
    await p.fill("#decision-note", "Live test: welcome!");
    await p.click('[data-action="accept"]');
    await p.waitForFunction(() => /Accepted\. The join link was emailed|could not be sent/.test(document.querySelector("#detail-status")?.textContent || ""), null, { timeout: 30000 });
    assert.match(await p.locator("#detail-status").innerText(), /Accepted\. The join link was emailed/);
    assert.deepEqual(p.errors, []);
    await p.context().close();
  });

  test("LIVE-04 new mentor: join link → password → pre-filled profile → photo → directory", { skip: turnstileOn && "needs LIVE-03" }, async () => {
    // The real link went to a test inbox nobody reads: give the invite a token we know
    const token = randomBytes(32).toString("base64url");
    await db.from("beyond_invites").update({ token_hash: createHash("sha256").update(token).digest("hex") }).eq("email", PEOPLE.mentor);
    const p = await page();
    await p.goto(SITE + "/join.html?token=" + token);
    await shown(p, "#join-panel");
    assert.equal(await p.locator("#join-hello").innerText(), T.joinHello.replace("{name}", "Live"));
    state.mentorPassword = pw();
    await p.fill("#join-password", state.mentorPassword);
    await p.fill("#join-password2", state.mentorPassword);
    await p.click("#join-form button[type=submit]");
    await p.waitForURL(/my-card\.html\?welcome=1/, { timeout: 30000 });
    await shown(p, "#card-editor");
    assert.equal(await p.inputValue("#position"), "Researcher");
    assert.equal(await p.inputValue("#company"), "ETH Zurich");
    assert.equal(await p.locator('[data-line="studies"]').first().inputValue(), "ETH Zurich, PhD Physics");
    const b64 = await p.evaluate(() => { const c = document.createElement("canvas"); c.width = 900; c.height = 700; const g = c.getContext("2d"); g.fillStyle = "#2251FF"; g.fillRect(0, 0, 900, 700); return c.toDataURL("image/jpeg", 0.9).split(",")[1]; });
    await p.setInputFiles("#photo", { name: "me.jpg", mimeType: "image/jpeg", buffer: Buffer.from(b64, "base64") });
    await p.waitForFunction(() => /^blob:/.test(document.querySelector("#photo-preview").src));
    await p.click("#card-form button[type=submit]");
    await shown(p, "#card-done", 30000);
    assert.equal(await p.locator("#card-status").innerText(), T.saved);
    await p.click("#card-done");
    await shown(p, "#members-directory");
    const card = p.locator("#member-grid li", { hasText: "Live Mentor" });
    assert.equal(await card.count(), 1);
    const img = card.locator("img");
    await img.scrollIntoViewIfNeeded();
    await p.waitForFunction((el) => el.complete && el.naturalWidth > 0, await img.elementHandle(), { timeout: 20000 });
    assert.deepEqual(await img.evaluate((el) => [el.naturalWidth, el.naturalHeight]), [400, 400], "photo shown, resized");
    assert.ok(await p.locator("[data-admin-link]").isHidden(), "no Admin button for a member");
    assert.deepEqual(p.errors, []);
    state.mentorPage = p;
  });

  test("LIVE-05 log out, then 'Forgot your password?' answers on the login page", { skip: turnstileOn && "needs LIVE-04" }, async () => {
    const p = state.mentorPage;
    await p.goto(SITE + "/my-card.html");
    await shown(p, "#card-editor");
    await p.click("#card-signout");
    await p.waitForURL(/login\.html$/, { timeout: 20000 });
    await shown(p, "#members-signin");
    assert.match(await navText(p), /Login$/);
    await p.fill("#signin-email", PEOPLE.mentor);
    await p.click("[data-show-reset]");
    await p.click("#reset-form button[type=submit]");
    await shown(p, "#reset-status");
    assert.equal(await p.locator("#reset-status").innerText(), T.resetSent);
    await p.goto(SITE + "/members.html");
    await p.waitForURL(/login\.html\?next=members/, { timeout: 20000 });
    assert.deepEqual(p.errors, []);
    await p.context().close();
  });

  test("LIVE-06 the mentor logs back in with their password and lands on My profile", { skip: turnstileOn && "needs LIVE-04" }, async () => {
    const p = await page();
    await login(p, "mentor", state.mentorPassword);
    await p.waitForURL(/my-card\.html/, { timeout: 20000 });
    await shown(p, "#card-editor");
    assert.equal(await p.inputValue("#first-name"), "Live");
    assert.deepEqual(p.errors, []);
    await p.context().close();
  });
});
