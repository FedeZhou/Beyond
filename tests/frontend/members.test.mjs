// Frontend tests: the members area in a real browser (login, menu, directory,
// My profile, join link, new password), against a fake Supabase.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, MOCK_URL } from "../helpers/server.mjs";
import { launch, openPage, closePage, navText } from "../helpers/browser.mjs";
import { mockSupabase, memberRoutes, session, user, profile } from "../helpers/mock-supabase.mjs";
import { content } from "../helpers/repo.mjs";

const T = content().strings.en.members;
const EMAIL = content().contact.email;
let server, browser;
before(async () => { server = await startServer({ mode: "mock" }); browser = await launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const ME = user("user-1", "mia@example.com");
const others = [
  profile({ id: "user-2", role: "mentor", first_name: "Leo", last_name: "Chen", city: "Zurich", country: "Switzerland", position: "Researcher", company: "ETH Zurich", photo_path: "user-2/avatar-1.jpg", studies: ["ETH Zurich, PhD"], experience: ["Google intern"], description: "Chess and trail running", linkedin: "https://www.linkedin.com/in/leo-chen" }),
  profile({ id: "user-3", role: "mentee", first_name: "Ana", last_name: "Wu", city: "Bologna", photo_path: null }),
  profile({ id: "user-4", role: "mentee", first_name: "Hidden", last_name: "Person", is_listed: false }),
  profile({ id: "user-5", role: "mentee", first_name: "Not", last_name: "Saved", onboarded_at: null }),
];
// Opens a page as a logged-in member (or logged out: loggedIn = false)
async function open(path, { loggedIn = true, me = profile(), routes = {}, isAdmin = false, viewport } = {}) {
  let api;
  const page = await openPage(browser, server.base, path, {
    viewport,
    session: loggedIn ? session(ME) : null,
    mock: async (p) => { api = await mockSupabase(p, { ...memberRoutes({ me, others, isAdmin }), ...routes }); },
  });
  return { page, api };
}
const visible = (page, sel) => page.waitForSelector(sel + ":not([hidden])", { timeout: 10000 });

describe("FE-LOGIN login page", () => {
  const tokenOk = { "POST /auth/v1/token": () => session(ME) };
  test("FE-LOGIN-01 correct email and password → My profile", async () => {
    const { page, api } = await open("login.html", { loggedIn: false, routes: tokenOk });
    await visible(page, "#members-signin");
    await page.fill("#signin-email", " Mia@Example.com ");
    await page.fill("#signin-password", "correct-password");
    await page.click("#signin-form button[type=submit]");
    await page.waitForURL(/my-card\.html$/);
    const call = api.last("POST", "/auth/v1/token");
    assert.equal(call.query.get("grant_type"), "password");
    assert.deepEqual({ email: call.body.email, password: call.body.password }, { email: "mia@example.com", password: "correct-password" });
    await visible(page, "#card-editor");
    await closePage(page, assert);
  });
  test("FE-LOGIN-02 after logging in from the directory or admin portal, you go back there", async () => {
    for (const [next, target] of [["members", /members\.html$/], ["admin", /admin\.html$/]]) {
      const { page } = await open("login.html?next=" + next, { loggedIn: false, routes: tokenOk });
      await visible(page, "#members-signin");
      await page.fill("#signin-email", "mia@example.com");
      await page.fill("#signin-password", "correct-password");
      await page.click("#signin-form button[type=submit]");
      await page.waitForURL(target);
      await page.context().close();
    }
  });
  test("FE-LOGIN-03 a wrong password or too many attempts: clear messages", async () => {
    for (const [reply, message] of [
      [{ status: 400, json: { code: "invalid_credentials", message: "Invalid login credentials" } }, T.signInWrong],
      [{ status: 429, json: { message: "Too many requests" } }, T.signInTooMany],
    ]) {
      const { page } = await open("login.html", { loggedIn: false, routes: { "POST /auth/v1/token": reply } });
      await visible(page, "#members-signin");
      await page.fill("#signin-email", "mia@example.com");
      await page.fill("#signin-password", "wrong-password");
      await page.click("#signin-form button[type=submit]");
      await visible(page, "#signin-status");
      assert.equal(await page.locator("#signin-status").innerText(), message);
      assert.match(page.url(), /login\.html$/);
      await closePage(page, assert);
    }
  });
  test("FE-LOGIN-04 empty fields are caught before anything is sent", async () => {
    const { page, api } = await open("login.html", { loggedIn: false });
    await visible(page, "#members-signin");
    await page.click("#signin-form button[type=submit]");
    assert.ok(await page.locator("#signin-email-error").isVisible());
    assert.equal(api.find("POST", "/auth/v1/token").length, 0);
    await closePage(page, assert);
  });
  test("FE-LOGIN-05 'Forgot your password?' emails a link (same answer for everyone) and waits a minute", async () => {
    const { page, api } = await open("login.html", { loggedIn: false, routes: { "POST /functions/v1/beyond-password-reset": { ok: true } } });
    await visible(page, "#members-signin");
    await page.fill("#signin-email", "Mia@Example.com");
    await page.click("[data-show-reset]");
    assert.equal(await page.inputValue("#reset-email"), "Mia@Example.com");
    await page.click("#reset-form button[type=submit]");
    await visible(page, "#reset-status");
    assert.equal(await page.locator("#reset-status").innerText(), T.resetSent);
    assert.deepEqual(api.last("POST", "/functions/v1/beyond-password-reset").body, { email: "mia@example.com" });
    const button = page.locator("#reset-form button[type=submit]");
    assert.equal(await button.isDisabled(), true);
    assert.match(await button.textContent(), /\(\d+\)$/);
    await page.click("[data-show-signin]");
    assert.ok(await page.locator("#signin-panel").isVisible());
    await closePage(page, assert);
  });
  test("FE-LOGIN-06 already logged in: the login page goes straight to My profile", async () => {
    const { page } = await open("login.html");
    await page.waitForURL(/my-card\.html$/);
    await closePage(page, assert);
  });
  test("FE-LOGIN-07 an expired email link says so", async () => {
    const { page } = await open("login.html#error_code=otp_expired&error_description=expired", { loggedIn: false });
    await visible(page, "#signin-status");
    assert.equal(await page.locator("#signin-status").innerText(), T.linkExpired);
    await closePage(page, assert);
  });
});

describe("FE-NAV menu and access", () => {
  test("FE-NAV-01 logged in: the menu shows Directory and My profile instead of Login, and no apply links", async () => {
    const { page } = await open("index.html");
    assert.equal(await navText(page), "Home About Directory My profile");
    assert.match(await page.locator("#site-nav a", { hasText: "My profile" }).getAttribute("href"), /my-card\.html$/);
    await closePage(page, assert);
  });
  test("FE-NAV-05 logged in: the mentor and mentee pages and the home page buttons still work", async () => {
    const { page } = await open("index.html");
    assert.ok(await page.locator(".hero-actions").isVisible());
    await page.goto(server.base + "/mentor.html");
    await page.waitForSelector("form[data-form]");
    await closePage(page, assert);
  });
  test("FE-NAV-02 logged out: members pages send you to the login page", async () => {
    for (const [path, target] of [["members.html", /login\.html\?next=members$/], ["my-card.html", /login\.html$/], ["admin.html", /login\.html\?next=admin$/]]) {
      const { page } = await open(path, { loggedIn: false });
      await page.waitForURL(target);
      await page.context().close();
    }
  });
  test("FE-NAV-03 log out (only on My profile, not in the directory): login page, menu shows Login, nothing left", async () => {
    {
      const { page } = await open("members.html");
      await visible(page, "#members-directory");
      assert.equal(await page.locator("#members-directory [data-signout]").count(), 0, "no Log out in the directory");
      await closePage(page, assert);
    }
    for (const [path, ready, button] of [["my-card.html", "#card-editor", "#card-signout"]]) {
      const { page, api } = await open(path);
      await visible(page, ready);
      const navigations = [];
      page.on("framenavigated", (f) => { if (f === page.mainFrame()) navigations.push(f.url()); });
      await page.click(button);
      await page.waitForURL(/login\.html$/);
      await page.waitForSelector("#members-signin:not([hidden])");
      assert.equal(navigations.length, 1, "one navigation, straight to login.html: " + navigations.join(", "));
      assert.equal(api.find("POST", "/auth/v1/logout").length, 1);
      assert.match(await navText(page), /Login$/);
      const left = await page.evaluate(() => Object.keys(localStorage).filter((k) => /^beyond\.|^sb-/.test(k)));
      assert.deepEqual(left, []);
      await closePage(page, assert);
    }
  });
  test("FE-NAV-04 a suspended member sees 'not active' and can log out", async () => {
    for (const path of ["members.html", "my-card.html"]) {
      const { page } = await open(path, { me: profile({ status: "suspended" }) });
      await visible(page, "#members-inactive");
      assert.equal(await page.locator("#members-inactive-text").innerText(), T.notActive.replace("{email}", EMAIL));
      assert.ok(await page.locator("#members-directory").count() === 0 || await page.locator("#members-directory").isHidden());
      await closePage(page, assert);
    }
  });
});

describe("FE-DIR directory", () => {
  test("FE-DIR-01 shows finished, visible cards only, with photo or grey portrait", async () => {
    const { page } = await open("members.html");
    await visible(page, "#members-directory");
    const names = await page.locator("#member-grid .member-name").allInnerTexts();
    assert.deepEqual(names.sort(), ["Ana Wu", "Leo Chen", "Mia Rossi"]);
    const leo = page.locator("#member-grid li", { hasText: "Leo Chen" });
    assert.match(await leo.locator("img").getAttribute("src"), new RegExp("^" + MOCK_URL.replace(/\./g, "\\.") + "/storage/v1/object/sign/beyond-avatars/user-2/avatar-1\\.jpg"));
    assert.match(await page.locator("#member-grid li", { hasText: "Ana Wu" }).locator("img").getAttribute("src"), /placeholder-person\.svg$/);
    assert.match(await leo.innerText(), /Researcher @ ETH Zurich/);
    assert.match(await leo.innerText(), /Zurich, Switzerland/);
    assert.doesNotMatch(await leo.innerText(), /Google intern|ETH Zurich, PhD/);   // studies and experience are in the pop-up only
    assert.match(await leo.locator(".mentor-linkedin").getAttribute("href"), /^https:\/\/www\.linkedin\.com\/in\/leo/);
    assert.match(await leo.locator(".member-badge").textContent(), /Mentor/);
    assert.equal(await page.locator('[data-count="all"]').innerText(), "3");
    assert.equal(await page.locator('[data-count="mentor"]').innerText(), "1");
    await closePage(page, assert);
  });
  test("FE-DIR-07 clicking a card opens a pop-up with all the details; Esc closes it", async () => {
    const { page } = await open("members.html");
    await visible(page, "#member-grid");
    await page.locator("#member-grid li", { hasText: "Leo Chen" }).click();   // anywhere on the card
    const dialog = page.locator("dialog.member-dialog");
    await dialog.waitFor({ state: "visible" });
    const text = await dialog.innerText();
    for (const part of ["Leo Chen", "Researcher @ ETH Zurich", "Zurich, Switzerland", "Chess and trail running", "ETH Zurich, PhD", "Google intern"]) {
      assert.ok(text.includes(part), part);
    }
    assert.equal(await dialog.locator('a[href="https://www.linkedin.com/in/leo-chen"]').count(), 1);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await closePage(page, assert);
  });
  test("FE-DIR-02 filters and search (ignores capitals and accents)", async () => {
    const { page } = await open("members.html");
    await visible(page, "#members-directory");
    await page.click('[data-filter="mentee"]');
    assert.deepEqual((await page.locator("#member-grid .member-name").allInnerTexts()).sort(), ["Ana Wu", "Mia Rossi"]);
    assert.equal(await page.locator('[data-filter="mentee"]').getAttribute("aria-pressed"), "true");
    await page.click('[data-filter="all"]');
    await page.fill("#members-search", "ZÜRICH");
    await page.waitForTimeout(300);
    assert.deepEqual(await page.locator("#member-grid .member-name").allInnerTexts(), ["Leo Chen"]);
    await page.fill("#members-search", "nobody-like-this");
    await page.waitForTimeout(300);
    assert.ok(await page.locator("#members-empty").isVisible());
    assert.equal(await page.locator("#members-count").innerText(), T.count.replace("{n}", 0));
    await closePage(page, assert);
  });
  test("FE-DIR-03 the Admin button only for admins", async () => {
    let { page } = await open("members.html");
    await visible(page, "#members-directory");
    assert.ok(await page.locator("[data-admin-link]").isHidden());
    await closePage(page, assert);
    ({ page } = await open("members.html", { me: profile({ role: "admin" }) }));
    await visible(page, "#members-directory");
    assert.ok(await page.locator("[data-admin-link]").isVisible());
    await closePage(page, assert);
  });
  test("FE-DIR-04 a member who never saved their card is sent to My profile first", async () => {
    const { page } = await open("members.html", { me: profile({ onboarded_at: null }) });
    await page.waitForURL(/my-card\.html\?welcome=1$/);
    await page.context().close();
  });
  test("FE-DIR-05 the directory is fetched once and kept; Refresh waits 30 seconds", async () => {
    const { page, api } = await open("members.html");
    await visible(page, "#members-directory");
    const before = api.find("GET", "/rest/v1/beyond_profiles").length;
    await page.reload();
    await visible(page, "#members-directory");
    assert.equal(api.find("GET", "/rest/v1/beyond_profiles").length, before, "second visit uses the kept copy");
    await page.click("[data-refresh]");
    assert.equal(await page.locator("#members-notice").innerText(), T.refreshWait);
    await closePage(page, assert);
  });
  test("FE-DIR-06 if the directory can't load, a clear message", async () => {
    const { page } = await open("members.html", { routes: { "GET /rest/v1/beyond_profiles": { status: 500, json: { message: "down" } } } });
    page.errors = [];
    await visible(page, "#members-notice");
    assert.equal(await page.locator("#members-notice").innerText(), T.loadError);
    await page.context().close();
  });
});

describe("FE-CARD My profile", () => {
  test("FE-CARD-01 shows the card, filled in from the application after joining", async () => {
    const { page } = await open("my-card.html?welcome=1", { me: profile({ onboarded_at: null, experience: ["Lab assistant"] }) });
    await visible(page, "#card-editor");
    assert.equal(await page.inputValue("#first-name"), "Mia");
    assert.equal(await page.inputValue("#position"), "BSc Aerospace Engineering");
    assert.equal(await page.inputValue("#company"), "Politecnico di Milano");
    assert.equal(await page.locator('[data-line="studies"]').first().inputValue(), "Politecnico di Milano, BSc Aerospace Engineering");
    assert.equal(await page.locator('[data-line="experience"]').first().inputValue(), "Lab assistant");
    assert.match(await page.locator("#photo-preview").getAttribute("src"), /placeholder-person\.svg$/);
    await closePage(page, assert);
  });
  test("FE-CARD-02 saving sends the card; 'Go to the directory' appears", async () => {
    const { page, api } = await open("my-card.html");
    await visible(page, "#card-editor");
    await page.fill("#city", "Turin");
    await page.locator('[data-line="experience"]').nth(1).fill("Summer school");
    await page.uncheck("#is-listed");
    await page.click("#card-form button[type=submit]");
    await visible(page, "#card-done");
    assert.equal(await page.locator("#card-status").innerText(), T.saved);
    const patch = api.last("PATCH", "/rest/v1/beyond_profiles");
    assert.equal(patch.query.get("id"), "eq.user-1");
    assert.deepEqual(patch.body, {
      first_name: "Mia", last_name: "Rossi", city: "Turin", country: "Italy", position: "BSc Aerospace Engineering",
      company: "Politecnico di Milano", studies: ["Politecnico di Milano, BSc Aerospace Engineering"], experience: ["Summer school"],
      linkedin: "", description: "", is_listed: false, photo_path: null,
    });
    await closePage(page, assert);
  });
  test("FE-CARD-03 required fields, and a LinkedIn link that is not a web address", async () => {
    const { page, api } = await open("my-card.html");
    await visible(page, "#card-editor");
    await page.fill("#first-name", "");
    await page.fill("#linkedin", "linkedin.com/in/mia");
    await page.click("#card-form button[type=submit]");
    assert.ok(await page.locator("#first-name-error").isVisible());
    assert.ok(await page.locator("#linkedin-error").isVisible());
    assert.equal(api.find("PATCH", "/rest/v1/beyond_profiles").length, 0);
    await closePage(page, assert);
  });
  test("FE-CARD-05 Studies, LinkedIn and About me are optional; About me stops at 300 characters", async () => {
    const { page, api } = await open("my-card.html");
    await visible(page, "#card-editor");
    for (const input of await page.locator('[data-line="studies"]').all()) await input.fill("");
    await page.fill("#description", "x".repeat(400));
    assert.equal(await page.inputValue("#description"), "x".repeat(300));
    assert.equal(await page.locator("#description-count").innerText(), "300 / 300");
    await page.fill("#description", "Climbing and chess");
    await page.click("#card-form button[type=submit]");
    await visible(page, "#card-done");
    const patch = api.last("PATCH", "/rest/v1/beyond_profiles");
    assert.deepEqual(patch.body.studies, []);
    assert.equal(patch.body.description, "Climbing and chess");
    assert.equal(patch.body.linkedin, "");
    await closePage(page, assert);
  });
  test("FE-CARD-04 a new photo: cropped to a 3:4 portrait, 450×600 JPEG, uploaded to your folder, old one removed", async () => {
    const { page, api } = await open("my-card.html", { me: profile({ photo_path: "user-1/avatar-old.jpg" }) });
    await visible(page, "#card-editor");
    const b64 = await page.evaluate(() => {
      const c = document.createElement("canvas"); c.width = 1600; c.height = 900;
      c.getContext("2d").fillRect(0, 0, 1600, 900);
      return c.toDataURL("image/png").split(",")[1];
    });
    await page.setInputFiles("#photo", { name: "me.png", mimeType: "image/png", buffer: Buffer.from(b64, "base64") });
    await page.waitForFunction(() => /^blob:/.test(document.querySelector("#photo-preview").src));
    const size = await page.locator("#photo-preview").evaluate((img) => new Promise((r) => (img.complete ? r([img.naturalWidth, img.naturalHeight]) : (img.onload = () => r([img.naturalWidth, img.naturalHeight])))));
    assert.deepEqual(size, [450, 600]);
    await page.click("#card-form button[type=submit]");
    await visible(page, "#card-done");
    const upload = api.calls.find((c) => c.method === "POST" && /^\/storage\/v1\/object\/beyond-avatars\/user-1\/avatar-\d+\.jpg$/.test(c.path));
    assert.ok(upload, "uploaded into the member's own folder");
    assert.match(String(upload.body), /Content-Type: image\/jpeg/, "sent as a JPEG");
    const patch = api.last("PATCH", "/rest/v1/beyond_profiles");
    assert.equal(patch.body.photo_path, upload.path.replace("/storage/v1/object/beyond-avatars/", ""));
    assert.deepEqual(api.last("DELETE", "/storage/v1/object/beyond-avatars").body, { prefixes: ["user-1/avatar-old.jpg"] });
    await closePage(page, assert);
  });
  test("FE-CARD-05 not an image, or remove the photo", async () => {
    const { page, api } = await open("my-card.html", { me: profile({ photo_path: "user-1/avatar-old.jpg" }) });
    await visible(page, "#card-editor");
    await page.setInputFiles("#photo", { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
    assert.equal(await page.locator("#photo-error").innerText(), T.photoType);
    await page.click("#photo-remove");
    assert.match(await page.locator("#photo-preview").getAttribute("src"), /placeholder-person\.svg$/);
    await page.click("#card-form button[type=submit]");
    await visible(page, "#card-done");
    assert.equal(api.last("PATCH", "/rest/v1/beyond_profiles").body.photo_path, null);
    assert.deepEqual(api.last("DELETE", "/storage/v1/object/beyond-avatars").body, { prefixes: ["user-1/avatar-old.jpg"] });
    await closePage(page, assert);
  });
  test("FE-CARD-06 the database's save limits are explained", async () => {
    for (const [message, text] of [["rate_limited: please wait a few seconds before saving again", T.saveWait], ["rate_limited: too many changes, please try again later", T.saveTooMany], ["something else", T.saveError]]) {
      const { page } = await open("my-card.html", { routes: { "PATCH /rest/v1/beyond_profiles": { status: 400, json: { code: "P0001", message } } } });
      page.errors = [];
      await visible(page, "#card-editor");
      await page.click("#card-form button[type=submit]");
      await visible(page, "#card-status");
      assert.equal(await page.locator("#card-status").innerText(), text);
      assert.ok(await page.locator("#card-done").isHidden());
      await page.context().close();
    }
  });
});

describe("FE-JOIN join link (join.html)", () => {
  const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcd";
  test("FE-JOIN-01 greets by name, hides the token, creates the account, logs in, opens My profile", async () => {
    const { page, api } = await open("join.html?token=" + TOKEN, {
      loggedIn: false,
      routes: {
        "POST /functions/v1/beyond-join": (c) => (c.body.action === "check" ? { firstName: "Mia", email: "mia@example.com", accountExists: false } : { ok: true, email: "mia@example.com", accountExists: false }),
        "POST /auth/v1/token": () => session(ME),
      },
    });
    await visible(page, "#join-panel");
    assert.equal(await page.locator("#join-hello").innerText(), T.joinHello.replace("{name}", "Mia"));
    assert.equal(await page.inputValue("#join-email"), "mia@example.com");
    assert.doesNotMatch(page.url(), /token=/, "the private link is removed from the address bar");
    await page.fill("#join-password", "short");
    await page.click("#join-form button[type=submit]");
    assert.equal(await page.locator("#join-password-error").innerText(), T.passwordShort.replace("{min}", 10));
    await page.fill("#join-password", "a-long-password");
    await page.fill("#join-password2", "a-long-passwor");
    await page.click("#join-form button[type=submit]");
    assert.equal(await page.locator("#join-password2-error").innerText(), T.passwordMismatch);
    await page.fill("#join-password2", "a-long-password");
    await page.click("#join-form button[type=submit]");
    await page.waitForURL(/my-card\.html\?welcome=1$/);
    const claim = api.find("POST", "/functions/v1/beyond-join").find((c) => c.body.action === "claim");
    assert.deepEqual(claim.body, { action: "claim", token: TOKEN, password: "a-long-password" });
    assert.equal(api.last("POST", "/auth/v1/token").body.email, "mia@example.com");
    await page.context().close();
  });
  for (const [label, reply, message] of [
    ["invalid", { status: 404, json: { error: "invalid_token" } }, T.joinInvalid],
    ["already used", { status: 409, json: { error: "used" } }, T.joinUsed],
    ["expired", { status: 410, json: { error: "expired" } }, T.joinExpired],
  ]) {
    test(`FE-JOIN-02 a link that is ${label}: a clear message and a way to log in`, async () => {
      const { page } = await open("join.html?token=" + TOKEN, { loggedIn: false, routes: { "POST /functions/v1/beyond-join": reply } });
      await visible(page, "#join-message");
      assert.equal(await page.locator("#join-message-text").innerText(), message.replace("{email}", EMAIL));
      assert.match(await page.locator("#join-message a").getAttribute("href"), /login\.html$/);
      await closePage(page, assert);
    });
  }
  test("FE-JOIN-03 no token in the address: 'not valid'", async () => {
    const { page } = await open("join.html", { loggedIn: false });
    await visible(page, "#join-message");
    assert.equal(await page.locator("#join-message-text").innerText(), T.joinInvalid.replace("{email}", EMAIL));
    await closePage(page, assert);
  });
  test("FE-JOIN-04 email already has an account: no new password asked, link marked as used", async () => {
    const { page, api } = await open("join.html?token=" + TOKEN, { loggedIn: false, routes: { "POST /functions/v1/beyond-join": (c) => (c.body.action === "check" ? { firstName: "Mia", email: "mia@example.com", accountExists: true } : { ok: true, accountExists: true }) } });
    await visible(page, "#join-message");
    assert.equal(await page.locator("#join-message-text").innerText(), T.joinExisting);
    await page.waitForFunction(() => true);
    await page.waitForTimeout(300);
    assert.deepEqual(api.find("POST", "/functions/v1/beyond-join").map((c) => c.body.action), ["check", "claim"]);
    assert.ok(await page.locator("#join-panel").isHidden());
    await closePage(page, assert);
  });
  test("FE-JOIN-05 the server refuses the password: its reason is shown", async () => {
    const { page } = await open("join.html?token=" + TOKEN, { loggedIn: false, routes: { "POST /functions/v1/beyond-join": (c) => (c.body.action === "check" ? { firstName: "Mia", email: "mia@example.com", accountExists: false } : { status: 400, json: { error: "password", message: "Password is too weak" } }) } });
    await visible(page, "#join-panel");
    await page.fill("#join-password", "a-long-password");
    await page.fill("#join-password2", "a-long-password");
    await page.click("#join-form button[type=submit]");
    await visible(page, "#join-status");
    assert.equal(await page.locator("#join-status").innerText(), "Password is too weak");
    await closePage(page, assert);
  });
});

describe("FE-RESET new password (reset-password.html)", () => {
  test("FE-RESET-01 from the emailed link: the page logs in from the link and saves the new password", async () => {
    const access = session(ME).access_token;
    const { page, api } = await open(`reset-password.html#access_token=${access}&expires_in=3600&expires_at=${Math.floor(Date.now() / 1000) + 3600}&refresh_token=r1&token_type=bearer&type=recovery`, {
      loggedIn: false,
      routes: { "GET /auth/v1/user": ME, "PUT /auth/v1/user": ME },
    });
    await visible(page, "#password-panel");
    assert.doesNotMatch(page.url(), /access_token/, "tokens removed from the address bar");
    await page.fill("#new-password", "my-new-password");
    await page.fill("#new-password2", "my-new-password");
    await page.click("#password-form button[type=submit]");
    await visible(page, "#password-done");
    assert.equal(await page.locator("#password-status").innerText(), T.passwordSaved);
    assert.equal(api.last("PUT", "/auth/v1/user").body.password, "my-new-password");
    await closePage(page, assert);
  });
  test("FE-RESET-02 without a link: explains how to get one; an expired link says so", async () => {
    let { page } = await open("reset-password.html", { loggedIn: false });
    await visible(page, "#password-message");
    assert.equal(await page.locator("#password-message-text").innerText(), T.resetNoLink);
    await closePage(page, assert);
    ({ page } = await open("reset-password.html#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired", { loggedIn: false }));
    await visible(page, "#password-message");
    assert.equal(await page.locator("#password-message-text").innerText(), T.linkExpired);
    await closePage(page, assert);
  });
  test("FE-RESET-03 'Change my password' from My profile; the server's reason is shown if refused", async () => {
    const { page } = await open("reset-password.html", { routes: { "PUT /auth/v1/user": { status: 422, json: { code: "same_password", message: "New password should be different from the old password." } } } });
    page.errors = [];
    await visible(page, "#password-panel");
    await page.fill("#new-password", "my-new-password");
    await page.fill("#new-password2", "my-new-password");
    await page.click("#password-form button[type=submit]");
    await visible(page, "#password-status");
    assert.equal(await page.locator("#password-status").innerText(), "New password should be different from the old password.");
    await page.context().close();
  });
});
