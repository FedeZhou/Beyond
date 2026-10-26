// Frontend tests: the mentor and mentee application forms, in a real browser,
// against a fake beyond-apply (no email is ever sent).
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, MOCK_KEY } from "../helpers/server.mjs";
import { launch, openPage, closePage } from "../helpers/browser.mjs";
import { mockSupabase } from "../helpers/mock-supabase.mjs";
import { content } from "../helpers/repo.mjs";

const C = content();
let server, noConfig, browser;
before(async () => {
  server = await startServer({ mode: "mock" });
  noConfig = await startServer({ mode: "demo" });           // js/config.js missing
  browser = await launch();
});
after(async () => { await browser?.close(); await server?.close(); await noConfig?.close(); });

async function openForm(role, reply = { status: 200, json: { ok: true } }) {
  let api;
  const page = await openPage(browser, server.base, role + ".html", { mock: async (p) => { api = await mockSupabase(p, { "POST /functions/v1/beyond-apply": reply }); } });
  return { page, api };
}
async function fillMentee(page) {
  await page.fill("#first-name", "Mia"); await page.fill("#last-name", "Rossi"); await page.fill("#email", "Mia@Example.com");
  await page.fill("#city", "Milan"); await page.fill("#country", "Italy");
  await page.fill("#school", "Politecnico di Milano"); await page.fill("#programme", "BSc Aerospace Engineering"); await page.fill("#gpa", "28/30");
  await page.selectOption("#field", "Engineering");
  await page.fill("#goals", "An MSc abroad, then the space industry, with a mentor's help.");
  await page.fill("#achievement", "Winning a regional physics olympiad while working.");
  await page.check("#consent");
}
async function fillMentor(page) {
  await page.fill("#first-name", "Leo"); await page.fill("#last-name", "Chen"); await page.fill("#email", "leo@example.com");
  await page.fill("#city", "Zurich"); await page.fill("#country", "Switzerland");
  await page.fill("#company", "ETH Zurich"); await page.fill("#position", "Researcher");
  await page.selectOption("#field", "Other"); await page.fill("#field-other", "Quantum computing");
  await page.fill("#highest-degree", "ETH Zurich, PhD Physics"); await page.fill("#linkedin", "https://www.linkedin.com/in/leo");
  await page.fill("#motivation", "I want to be the role model I never had growing up.");
  await page.check("#consent");
}
const submit = (page) => page.click("form[data-form] button[type=submit]");
const statusText = (page) => page.locator(".form-status").innerText();

describe("FE-FORM checking the answers in the browser", () => {
  for (const role of ["mentor", "mentee"]) {
    test(`FE-FORM-01 ${role}: an empty form shows every error and sends nothing`, async () => {
      const { page, api } = await openForm(role);
      await submit(page);
      for (const id of ["first-name", "last-name", "email", "city", "country", "field", "consent"]) {
        assert.ok(await page.locator(`#${id}-error`).isVisible(), id);
        assert.equal(await page.locator("#" + id).getAttribute("aria-invalid"), "true", id);
      }
      assert.equal(await page.evaluate(() => document.activeElement.id), "first-name", "focus on the first problem");
      assert.equal(api.find("POST", "/functions/v1/beyond-apply").length, 0);
      await closePage(page, assert);
    });
  }
  test("FE-FORM-02 wrong email, short answers, link without https:// are explained", async () => {
    const { page } = await openForm("mentor");
    await fillMentor(page);
    await page.fill("#email", "not-an-email"); await page.fill("#linkedin", "linkedin.com/in/leo"); await page.fill("#motivation", "short");
    await submit(page);
    assert.match(await page.locator("#email-error").innerText(), /valid email/);
    assert.match(await page.locator("#linkedin-error").innerText(), /https:\/\//);
    assert.match(await page.locator("#motivation-error").innerText(), /at least 30/);
    await page.fill("#email", "leo@example.com");
    assert.ok(await page.locator("#email-error").isHidden(), "the error clears while typing");
    await closePage(page, assert);
  });
  test("FE-FORM-03 'Other' shows a required extra field and hides (and empties) it again", async () => {
    const { page } = await openForm("mentee");
    assert.ok(await page.locator("#field-other").isHidden());
    await page.selectOption("#field", "Other");
    assert.ok(await page.locator("#field-other").isVisible());
    await submit(page);
    assert.ok(await page.locator("#field-other-error").isVisible());
    await page.fill("#field-other", "Astrophysics");
    await page.selectOption("#field", "Physics");
    assert.ok(await page.locator("#field-other").isHidden());
    assert.equal(await page.inputValue("#field-other"), "");
    await closePage(page, assert);
  });
  test("FE-FORM-04 the browser stops answers longer than the server accepts", async () => {
    const { page } = await openForm("mentee");
    await page.fill("#first-name", "x".repeat(100));
    assert.equal((await page.inputValue("#first-name")).length, 60);
    await closePage(page, assert);
  });
});

describe("FE-FORM sending", () => {
  test("FE-FORM-05 mentee: sends exactly the answers to beyond-apply, then thanks", async () => {
    const { page, api } = await openForm("mentee");
    await fillMentee(page);
    await submit(page);
    await page.waitForSelector("#mentee-thanks:not([hidden])");
    const call = api.last("POST", "/functions/v1/beyond-apply");
    assert.equal(call.headers.apikey, MOCK_KEY);
    assert.equal(call.body.role, "mentee");
    assert.equal(call.body.honeypot, "");
    assert.equal(call.body.turnstileToken, "");
    assert.deepEqual(call.body.fields, {
      first_name: "Mia", last_name: "Rossi", email: "Mia@Example.com", city: "Milan", country: "Italy",
      school: "Politecnico di Milano", programme: "BSc Aerospace Engineering", gpa: "28/30",
      field: "Engineering", field_other: "", goals: "An MSc abroad, then the space industry, with a mentor's help.",
      achievement: "Winning a regional physics olympiad while working.", consent: true,
    });
    assert.ok(await page.locator("form[data-form]").isHidden());
    assert.equal(await page.evaluate(() => document.activeElement.id), "mentee-thanks");
    assert.match(await page.locator("#mentee-thanks").innerText(), /sent a copy of it to your email/);
    await closePage(page, assert);
  });
  test("FE-FORM-06 mentor: 'Other' explanation and LinkedIn are sent", async () => {
    const { page, api } = await openForm("mentor");
    await fillMentor(page);
    await submit(page);
    await page.waitForSelector("#mentor-thanks:not([hidden])");
    const f = api.last("POST", "/functions/v1/beyond-apply").body.fields;
    assert.equal(f.field, "Other");
    assert.equal(f.field_other, "Quantum computing");
    assert.equal(f.linkedin, "https://www.linkedin.com/in/leo");
    assert.equal(f.highest_degree, "ETH Zurich, PhD Physics");
    await closePage(page, assert);
  });
  test("FE-FORM-07 the button says 'Sending…' and is disabled while sending", async () => {
    let release;
    const slow = new Promise((r) => (release = r));
    const { page } = await openForm("mentee", async () => { await slow; return { status: 200, json: { ok: true } }; });
    await fillMentee(page);
    await submit(page);
    const button = page.locator("form[data-form] button[type=submit]");
    await page.waitForFunction(() => document.querySelector("form[data-form] button[type=submit]").disabled);
    assert.equal(await button.textContent(), C.strings.en.form.sending);
    release();
    await page.waitForSelector("#mentee-thanks:not([hidden])");
    await closePage(page, assert);
  });
  test("FE-FORM-08 spam trap filled: thanks shown, nothing sent", async () => {
    const { page, api } = await openForm("mentee");
    await fillMentee(page);
    await page.evaluate(() => { document.querySelector('input[name="_gotcha"]').value = "bot"; });
    await submit(page);
    await page.waitForSelector("#mentee-thanks:not([hidden])");
    assert.equal(api.find("POST", "/functions/v1/beyond-apply").length, 0);
    await closePage(page, assert);
  });
  const answers = [
    ["409 duplicate", { status: 409, json: { error: "duplicate" } }, C.strings.en.form.duplicate],
    ["429 too many", { status: 429, json: { error: "rate_limited" } }, C.strings.en.form.tooMany],
    ["400 spam check", { status: 400, json: { error: "captcha" } }, C.strings.en.form.captcha],
    ["400 invalid answers", { status: 400, json: { error: "invalid", fields: ["goals"] } }, C.strings.en.form.invalid],
    ["500 server error", { status: 500, json: { error: "server" } }, C.strings.en.form.error],
    ["no answer at all", { status: 502, body: "Bad gateway", contentType: "text/plain" }, C.strings.en.form.error],
  ];
  for (const [label, reply, message] of answers) {
    test(`FE-FORM-09 server answers ${label}: the right message, the form stays filled`, async () => {
      const { page } = await openForm("mentee", reply);
      await fillMentee(page);
      await submit(page);
      await page.waitForSelector(".form-status:not([hidden])");
      assert.equal(await statusText(page), message.replace("{email}", C.contact.email));
      assert.equal(await page.inputValue("#first-name"), "Mia");
      assert.equal(await page.locator("form[data-form] button[type=submit]").isEnabled(), true);
      assert.ok(await page.locator("#mentee-thanks").isHidden());
      // Server failures are logged for the developer; refusals the visitor can act on are not
      const logged = page.errors.filter((e) => /form could not be sent/.test(e));
      assert.equal(logged.length, reply.status >= 500 ? 1 : 0);
      page.errors = page.errors.filter((e) => !/form could not be sent/.test(e));
      await closePage(page, assert);
    });
  }
  test("FE-FORM-10 if the site's settings are missing, the form says so instead of pretending", async () => {
    const page = await openPage(browser, noConfig.base, "mentee.html");
    page.errors = [];
    await fillMentee(page);
    await submit(page);
    await page.waitForSelector(".form-status:not([hidden])");
    assert.equal(await statusText(page), C.strings.en.form.error.replace("{email}", C.contact.email));
    assert.ok(await page.locator("#mentee-thanks").isHidden());
    await page.context().close();
  });
});
