// Frontend tests: the admin portal (admin.html) in a real browser, against a fake Supabase.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../helpers/server.mjs";
import { launch, openPage, closePage } from "../helpers/browser.mjs";
import { mockSupabase, session, user } from "../helpers/mock-supabase.mjs";

let server, browser;
before(async () => { server = await startServer({ mode: "mock" }); browser = await launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const ADMIN = user("admin-1", "admin@example.com");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const day = 864e5;
function data() {
  const now = Date.now();
  return {
    apps: [
      { id: id(1), role: "mentee", status: "pending", email: "mia@example.com", first_name: "Mia", last_name: "Rossi", city: "Milan", country: "Italy", created_at: new Date(now - day).toISOString(), confirmation_sent_at: new Date(now - day).toISOString(), admin_notified_at: new Date(now - day).toISOString(), last_email_error: null, answers: { school: "Politecnico di Milano", programme: "BSc Aerospace", gpa: "28/30", field: "Other", field_other: "Astrophysics", goals: "An MSc abroad.\nThen the space industry.", achievement: "=HYPERLINK(\"http://evil\")" } },
      { id: id(2), role: "mentor", status: "pending", email: "leo@example.com", first_name: "Leo", last_name: "<img src=x onerror=alert(1)>", city: "Zurich", country: "Switzerland", created_at: new Date(now - 2 * day).toISOString(), confirmation_sent_at: null, admin_notified_at: new Date(now).toISOString(), last_email_error: "Resend 500: down", answers: { company: "ETH Zurich", position: "Researcher", field: "Physics", highest_degree: "PhD", linkedin: "https://www.linkedin.com/in/leo", motivation: "Be a role model." } },
      { id: id(3), role: "mentee", status: "accepted", email: "ana@example.com", first_name: "Ana", last_name: "Wu", city: "Bologna", country: "Italy", created_at: new Date(now - 9 * day).toISOString(), reviewed_at: new Date(now - 8 * day).toISOString(), decision_note: "Welcome!", answers: { school: "UniBo", programme: "BSc Physics", gpa: "29/30", field: "Physics", goals: "PhD", achievement: "Telescope" } },
      { id: id(4), role: "mentor", status: "rejected", email: "old@example.com", first_name: "Old", last_name: "Applicant", city: "Rome", country: "Italy", created_at: new Date(now - 20 * day).toISOString(), reviewed_at: new Date(now - 19 * day).toISOString(), answers: { company: "X", position: "Y", field: "Finance", highest_degree: "BSc", linkedin: "https://linkedin.com/in/old", motivation: "Help others grow." } },
    ],
    invites: [{ email: "ana@example.com", role: "mentee", application_id: id(3), sent_at: new Date(now - 8 * day).toISOString(), expires_at: new Date(now + 6 * day).toISOString(), claimed_at: null, created_at: new Date(now - 8 * day).toISOString() }],
    members: [
      { email: "admin@example.com", id: "admin-1", role: "admin", status: "approved", first_name: "Fede", last_name: "Zhou", has_photo: true, is_listed: true, onboarded_at: new Date(now - 30 * day).toISOString() },
      { email: "ana@example.com", id: null, role: "mentee", status: null, application_id: id(3), invite_sent_at: new Date(now - 8 * day).toISOString(), invite_expires_at: new Date(now + 6 * day).toISOString(), has_photo: false },
      { email: "late@example.com", id: null, role: "mentor", status: null, invite_sent_at: new Date(now - 20 * day).toISOString(), invite_expires_at: new Date(now - 6 * day).toISOString(), has_photo: false },
      { email: "new@example.com", id: "user-7", role: "mentee", status: "approved", first_name: "New", last_name: "Member", onboarded_at: null, has_photo: false, is_listed: true },
      { email: "sam@example.com", id: "user-8", role: "mentor", status: "suspended", first_name: "Sam", last_name: "Li", onboarded_at: new Date(now - 5 * day).toISOString(), has_photo: true, is_listed: true },
      { email: "kai@example.com", id: "user-9", role: "mentee", status: "approved", first_name: "Kai", last_name: "Lin", position: "Student", company: "PoliMi", onboarded_at: new Date(now - 3 * day).toISOString(), has_photo: false, is_listed: false },
    ],
    log: [
      { id: 2, at: new Date(now - day).toISOString(), actor_email: "admin@example.com", action: "set-member", target: "sam@example.com", details: { status: "suspended" } },
      { id: 1, at: new Date(now - 8 * day).toISOString(), actor_email: "admin@example.com", action: "accept", target: "ana@example.com", details: { role: "mentee", emailError: null } },
    ],
  };
}

// Opens the portal as an admin; `adminReply` answers the beyond-admin function
async function openPortal({ hash = "", isAdmin = true, adminReply = { ok: true, emailError: null }, d = data(), routes = {}, viewport } = {}) {
  let api;
  const page = await openPage(browser, server.base, "admin.html" + hash, {
    viewport,
    session: session(ADMIN),
    mock: async (p) => {
      api = await mockSupabase(p, {
        "POST /rest/v1/rpc/beyond_is_admin": isAdmin,
        "GET /rest/v1/beyond_applications": () => d.apps,
        "GET /rest/v1/beyond_invites": () => d.invites,
        "POST /rest/v1/rpc/beyond_admin_list_members": () => d.members,
        "GET /rest/v1/beyond_audit_log": () => d.log,
        "POST /functions/v1/beyond-admin": typeof adminReply === "function" ? adminReply : () => adminReply,
        ...routes,
      });
    },
  });
  if (isAdmin) await page.waitForSelector("#admin-app:not([hidden])", { timeout: 10000 });
  return { page, api, d };
}
const rows = (page) => page.locator("#app-rows tr");
const names = (page) => page.locator("#app-rows .admin-row-link").allInnerTexts();
const adminCalls = (api) => api.find("POST", "/functions/v1/beyond-admin").map((c) => c.body);
const openApp = async (page, name) => { await page.locator("#app-rows .admin-row-link", { hasText: name }).click(); await page.waitForSelector("#app-detail:not([hidden])"); };

describe("FE-ADM access and lists", () => {
  test("FE-ADM-01 a member who is not an admin sees 'admins only' and no data is loaded", async () => {
    const { page, api } = await openPortal({ isAdmin: false });
    await page.waitForSelector("#admin-denied:not([hidden])");
    assert.ok(await page.locator("#admin-app").isHidden());
    assert.equal(api.find("GET", "/rest/v1/beyond_applications").length, 0);
    await closePage(page, assert);
  });
  test("FE-ADM-02 counts per status; Pending first; filter by role; search inside the answers", async () => {
    const { page } = await openPortal();
    assert.equal(await page.locator('[data-tab-count="applications"]').innerText(), "2");
    for (const [s, n] of [["pending", "2"], ["accepted", "1"], ["rejected", "1"], ["all", "4"]]) assert.equal(await page.locator(`[data-status-count="${s}"]`).innerText(), n, s);
    assert.equal(await rows(page).count(), 2);
    await page.selectOption("#app-role", "mentor");
    assert.equal(await rows(page).count(), 1);
    await page.selectOption("#app-role", "all");
    await page.click('[data-status="all"]');
    await page.fill("#app-search", "astrophysics");
    await page.waitForTimeout(300);
    assert.deepEqual(await names(page), ["Mia Rossi"]);
    await page.fill("#app-search", "nothing-matches");
    await page.waitForTimeout(300);
    assert.ok(await page.locator("#app-empty").isVisible());
    await closePage(page, assert);
  });
  test("FE-ADM-03 text typed by applicants is shown as text, never run as HTML", async () => {
    const { page } = await openPortal();
    assert.equal(await page.locator("#app-rows img").count(), 0);
    assert.ok((await names(page)).includes("Leo <img src=x onerror=alert(1)>"));
    await openApp(page, "Leo");
    assert.equal(await page.locator("#app-detail img").count(), 0);
    await closePage(page, assert);
  });
  test("FE-ADM-04 detail: every answer with its label, LinkedIn link, email state, history", async () => {
    const { page } = await openPortal();
    await openApp(page, "Mia Rossi");
    const text = await page.locator("#app-detail").innerText();
    for (const s of ["School or university", "Politecnico di Milano", "Degree programme", "Field of interest (more)", "Astrophysics", "An MSc abroad.\nThen the space industry.", "mia@example.com", "Milan, Italy"]) assert.ok(text.includes(s), s);
    assert.match(page.url(), new RegExp("#application=" + id(1)));
    assert.ok(await page.locator('[data-action="accept"]').isVisible() && await page.locator('[data-action="reject"]').isVisible());
    assert.ok(await page.locator(".admin-list").isVisible(), "wide screen: list and application side by side");
    await openApp(page, "Leo");
    const leo = page.locator("#app-detail");
    const link = leo.locator('a[href="https://www.linkedin.com/in/leo"]');
    assert.equal(await link.getAttribute("rel"), "noopener noreferrer");
    assert.match(await leo.innerText(), /Not sent/);
    assert.match(await leo.innerText(), /Resend 500: down/);
    await closePage(page, assert);
  });
  test("FE-ADM-04b phone: the application replaces the list; 'Back to the list' returns", async () => {
    const { page } = await openPortal({ viewport: { width: 375, height: 760 } });
    await openApp(page, "Mia Rossi");
    assert.ok(await page.locator(".admin-list").isHidden());
    await page.click("[data-close]");
    assert.ok(await page.locator("#app-detail").isHidden());
    assert.ok(await page.locator(".admin-list").isVisible());
    assert.doesNotMatch(page.url(), /#application/);
    await closePage(page, assert);
  });
  test("FE-ADM-05 a link from the notification email opens that application", async () => {
    const { page } = await openPortal({ hash: "#application=" + id(3) });
    await page.waitForSelector("#app-detail:not([hidden])");
    assert.match(await page.locator("#app-detail").innerText(), /Ana Wu/);
    assert.equal(await page.locator('[data-status="accepted"]').getAttribute("aria-pressed"), "true");
    assert.ok(await page.locator('[data-action="resend-invite"]').isVisible(), "not joined yet: resend is offered");
    assert.ok(await page.locator('[data-action="delete-application"]').count() === 0, "accepted applications can't be deleted");
    await closePage(page, assert);
  });
});

describe("FE-ADM decisions", () => {
  test("FE-ADM-06 Accept sends the note, reloads, confirms the email went out", async () => {
    const { page, api } = await openPortal();
    await openApp(page, "Mia Rossi");
    await page.fill("#decision-note", "Welcome aboard!");
    const loadsBefore = api.find("GET", "/rest/v1/beyond_applications").length;
    await page.click('[data-action="accept"]');
    await page.waitForFunction(() => /join link was emailed/.test(document.querySelector("#detail-status")?.textContent || ""));
    assert.deepEqual(adminCalls(api), [{ action: "accept", id: id(1), message: "Welcome aboard!" }]);
    assert.ok(api.find("GET", "/rest/v1/beyond_applications").length > loadsBefore, "the list is reloaded");
    assert.match(await page.locator("#detail-status").innerText(), /mia@example\.com/);
    await closePage(page, assert);
  });
  test("FE-ADM-07 Accept when the email fails: says so, suggests resending", async () => {
    const { page } = await openPortal({ adminReply: { ok: true, emailError: "Resend 500" } });
    await openApp(page, "Mia Rossi");
    await page.click('[data-action="accept"]');
    await page.waitForSelector("#detail-status.is-error");
    assert.match(await page.locator("#detail-status").innerText(), /email could not be sent: Resend 500.*Resend join link/);
    await closePage(page, assert);
  });
  test("FE-ADM-08 Reject: polite email by default, or none", async () => {
    let { page, api } = await openPortal();
    await openApp(page, "Mia Rossi");
    assert.equal(await page.locator("#reject-notify").isChecked(), true);
    await page.fill("#decision-note", "Next year!");
    await page.click('[data-action="reject"]');
    await page.waitForFunction(() => /Rejected/.test(document.querySelector("#detail-status")?.textContent || ""));
    assert.deepEqual(adminCalls(api), [{ action: "reject", id: id(1), message: "Next year!", notify: true }]);
    await closePage(page, assert);
    ({ page, api } = await openPortal());
    await openApp(page, "Mia Rossi");
    await page.uncheck("#reject-notify");
    await page.click('[data-action="reject"]');
    await page.waitForFunction(() => /Rejected\./.test(document.querySelector("#detail-status")?.textContent || ""));
    assert.equal(adminCalls(api)[0].notify, false);
    await closePage(page, assert);
  });
  test("FE-ADM-09 Resend join link and Delete application", async () => {
    let { page, api } = await openPortal({ hash: "#application=" + id(3) });
    await page.waitForSelector("#app-detail:not([hidden])");
    await page.click('[data-action="resend-invite"]');
    await page.waitForFunction(() => /new join link/.test(document.querySelector("#detail-status")?.textContent || ""));
    assert.deepEqual(adminCalls(api), [{ action: "resend-invite", id: id(3) }]);
    await closePage(page, assert);
    ({ page, api } = await openPortal());                  // the "Are you sure?" dialog is answered yes
    await page.click('[data-status="rejected"]');
    await openApp(page, "Old Applicant");
    await page.click('[data-action="delete-application"]');
    await page.waitForFunction(() => /deleted/.test(document.querySelector("#members-notice")?.textContent || ""));
    assert.deepEqual(adminCalls(api), [{ action: "delete-application", id: id(4) }]);
    assert.ok(await page.locator("#app-detail").isHidden());
    await closePage(page, assert);
  });
  const errors = [
    ["already_member", /already a Beyond member/],
    ["not_pending", /already decided/],
    ["not_admin", /session has expired/],
    ["server", /went wrong on the server/],
  ];
  for (const [error, message] of errors) {
    test(`FE-ADM-10 the server says '${error}': a clear message, buttons usable again`, async () => {
      const { page } = await openPortal({ adminReply: { status: error === "not_admin" ? 403 : 409, json: { error } } });
      await openApp(page, "Mia Rossi");
      await page.click('[data-action="accept"]');
      await page.waitForSelector("#detail-status.is-error");
      assert.match(await page.locator("#detail-status").innerText(), message);
      assert.equal(await page.locator('[data-action="accept"]').isEnabled(), true);
      await closePage(page, assert);
    });
  }
});

describe("FE-ADM members, activity, export", () => {
  test("FE-ADM-11 Members tab: everyone with their state; your own row is locked", async () => {
    const { page } = await openPortal();
    await page.click('[data-tab="members"]');
    const row = (email) => page.locator("#member-rows tr", { hasText: email });
    const state = async (email) => (await row(email).locator(".admin-pill").textContent()).trim();
    assert.equal(await page.locator("#member-rows tr").count(), 6);
    assert.equal(await state("ana@example.com"), "Invited " + new Date(Date.now() - 8 * day).toLocaleString("en-GB", { dateStyle: "medium" }));
    assert.equal(await state("late@example.com"), "Invite expired");
    assert.equal(await state("new@example.com"), "Joined, card not saved");
    assert.equal(await state("sam@example.com"), "Suspended");
    assert.equal(await state("kai@example.com"), "Active, hidden");
    assert.equal(await state("admin@example.com"), "Active");
    assert.ok(await row("admin@example.com").locator("select").isDisabled());
    assert.equal(await row("admin@example.com").locator('[data-member="remove"]').count(), 0);
    assert.ok(await row("ana@example.com").locator("select").isDisabled(), "no card yet: no role to change");
    await closePage(page, assert);
  });
  test("FE-ADM-12 Members tab actions: role, suspend, reactivate, remove, open application", async () => {
    const { page, api } = await openPortal();
    await page.click('[data-tab="members"]');
    const row = (email) => page.locator("#member-rows tr", { hasText: email });
    const settle = () => page.waitForFunction(() => /Done|wrong/.test(document.querySelector("#member-status")?.textContent || ""));
    await row("kai@example.com").locator("select").selectOption("admin"); await settle();
    await row("kai@example.com").locator('[data-member="suspend"]').click(); await settle();
    await row("sam@example.com").locator('[data-member="reactivate"]').click(); await settle();
    await row("new@example.com").locator('[data-member="remove"]').click(); await settle();
    assert.deepEqual(adminCalls(api), [
      { action: "set-member", id: "user-9", role: "admin" },
      { action: "set-member", id: "user-9", status: "suspended" },
      { action: "set-member", id: "user-8", status: "approved" },
      { action: "remove-member", email: "new@example.com" },
    ]);
    await row("ana@example.com").locator('[data-member="application"]').click();
    await page.waitForSelector("#app-detail:not([hidden])");
    assert.match(await page.locator("#app-detail").innerText(), /Ana Wu/);
    await closePage(page, assert);
  });
  test("FE-ADM-13 Activity tab: who did what, in plain words", async () => {
    const { page } = await openPortal();
    await page.click('[data-tab="activity"]');
    const text = await page.locator("#log-rows").innerText();
    assert.match(text, /Changed member[\s\S]*status: suspended[\s\S]*sam@example\.com/);
    assert.match(text, /Accepted[\s\S]*ana@example\.com/);
    await closePage(page, assert);
  });
  test("FE-ADM-14 CSV export: Excel-friendly, every answer, formulas neutralised", async () => {
    const { page } = await openPortal();
    // Catch the file the portal creates (name + content) instead of a real download:
    // Edge opens a blank tab per download, which the test browser trips over on closing
    await page.evaluate(() => {
      window.__files = [];
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (!this.download) return click.call(this);
        const name = this.download;
        // Raw bytes: a text decoder would silently drop the UTF-8 mark at the start
        window.__files.push(fetch(this.href).then((r) => r.arrayBuffer()).then((buf) => ({ name, text: new TextDecoder("utf-8", { ignoreBOM: true }).decode(buf) })));
      };
    });
    const exported = async (button) => {
      await page.click(button);
      return page.evaluate(() => window.__files.at(-1));
    };
    const apps = await exported('[data-export="applications"]');
    assert.match(apps.name, /^beyond-applications-\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = apps.text;
    assert.ok(csv.startsWith("﻿"), "UTF-8 mark so Excel shows accents");
    const lines = csv.slice(1).split("\r\n");
    assert.equal(lines.length, 5);
    const header = lines[0].split(";");
    for (const h of ['"Applied"', '"Status"', '"Email"', '"school"', '"linkedin"', '"field_other"']) assert.ok(header.includes(h), h);
    assert.match(csv, /"'=HYPERLINK\(""http:\/\/evil""\)"/, "a formula is stored as text");
    assert.match(csv, /"An MSc abroad\.\nThen the space industry\."/);
    await page.click('[data-tab="members"]');
    const members = await exported('[data-export="members"]');
    assert.match(members.name, /^beyond-members-\d{4}-\d{2}-\d{2}\.csv$/);
    assert.equal(members.text.split("\r\n").length, 7);
    assert.match(members.text, /"Invite expired"/);
    await closePage(page, assert);
  });
  test("FE-ADM-15 if the portal can't load, a clear message", async () => {
    const p = await openPage(browser, server.base, "admin.html", {
      session: session(ADMIN),
      mock: (x) => mockSupabase(x, { "POST /rest/v1/rpc/beyond_is_admin": true, "GET /rest/v1/beyond_applications": { status: 500, json: { message: "down" } } }),
    });
    p.errors = [];
    await p.waitForSelector("#members-notice:not([hidden])");
    assert.match(await p.locator("#members-notice").innerText(), /could not be loaded/);
    await p.context().close();
  });
});
