// Frontend tests in a real browser: every page, the shared header and footer,
// and the public pages (Home, About). The Supabase backend is fake (no network).
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../helpers/server.mjs";
import { launch, openPage, closePage, overflowX, navText } from "../helpers/browser.mjs";
import { mockSupabase } from "../helpers/mock-supabase.mjs";
import { PAGES, content } from "../helpers/repo.mjs";

const C = content();
let server, browser;
before(async () => { server = await startServer({ mode: "mock" }); browser = await launch(); });
after(async () => { await browser?.close(); await server?.close(); });
// Logged out; the backend answers nothing useful (pages must still render cleanly)
const open = (path, opts = {}) => openPage(browser, server.base, path, { mock: (p) => mockSupabase(p, {}), ...opts });

describe("FE-ALL every page, desktop and phone", () => {
  for (const p of PAGES) {
    for (const [label, viewport] of [["desktop", { width: 1280, height: 900 }], ["phone", { width: 375, height: 760 }]]) {
      test(`FE-ALL-01 ${p} (${label}): loads without errors and without sideways scrolling`, async () => {
        const page = await open(p, { viewport });
        await page.waitForLoadState("networkidle");
        assert.match(await page.title(), /Beyond/);
        assert.ok(await overflowX(page) <= 1, "sideways scrolling: " + await overflowX(page) + "px");
        await closePage(page, assert);
      });
    }
  }
  test("FE-ALL-02 logged out: menu ends with Login, the current page is marked", async () => {
    for (const [p, current] of [["index.html", "Home"], ["about.html", "About"], ["mentor.html", "Become a mentor"], ["mentee.html", "Become a mentee"], ["login.html", "Login"]]) {
      const page = await open(p);
      assert.equal(await navText(page), "Home About Become a mentor Become a mentee Login", p);
      assert.equal(await page.locator('#site-nav a[aria-current="page"]').innerText(), current, p);
      assert.match(await page.locator("#site-nav a", { hasText: "Login" }).getAttribute("href"), /login\.html$/);
      await closePage(page, assert);
    }
  });
  test("FE-ALL-03 footer: contact email, current year, legal links", async () => {
    const page = await open("index.html");
    const footer = page.locator("#site-footer");
    assert.equal(await footer.locator(".footer-email").getAttribute("href"), "mailto:" + C.contact.email);
    assert.match(await footer.innerText(), new RegExp(String(new Date().getFullYear())));
    assert.equal(await footer.locator(".footer-legal a").count(), C.legal.length);
    await closePage(page, assert);
  });
  test("FE-ALL-04 phone menu: opens, closes with Escape, focus goes back to the button", async () => {
    const page = await open("about.html", { viewport: { width: 375, height: 760 } });
    const toggle = page.locator(".nav-toggle");
    assert.ok(await toggle.isVisible());
    assert.ok(await page.locator("#site-nav a", { hasText: "About" }).isHidden());
    await toggle.click();
    assert.equal(await toggle.getAttribute("aria-expanded"), "true");
    assert.ok(await page.locator("#site-nav a", { hasText: "Become a mentee" }).isVisible());
    await page.keyboard.press("Escape");
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    assert.equal(await page.evaluate(() => document.activeElement.className), "nav-toggle");
    await closePage(page, assert);
  });
  test("FE-ALL-05 keyboard: the first Tab reaches 'Skip to content'", async () => {
    const page = await open("mentee.html");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.className), "skip-link");
    await closePage(page, assert);
  });
});

describe("FE-PUB public pages", () => {
  test("FE-PUB-01 home: one card per mentor plus 'Join us'; arrows scroll; a tap shows the colours", async () => {
    const page = await open("index.html");
    await page.waitForSelector("#mentor-grid li");
    assert.equal(await page.locator("#mentor-grid > li").count(), C.mentors.length + 1);
    assert.equal(await page.locator("#mentor-grid .mentor-more a").getAttribute("href"), "#join");
    const next = page.locator('[data-carousel="next"]');
    if (await next.isEnabled()) {
      await next.click();
      await page.waitForFunction(() => document.querySelector(".carousel-viewport").scrollLeft > 0);
    }
    const card = page.locator("#mentor-grid .mentor-card").last();
    await card.scrollIntoViewIfNeeded();
    await card.click({ position: { x: 20, y: 20 } });
    assert.match(await card.getAttribute("class"), /is-color/);
    await closePage(page, assert);
  });
  test("FE-PUB-02 home: every mentor photo loads", async () => {
    const page = await open("index.html");
    await page.waitForSelector("#mentor-grid img");
    const broken = await page.$$eval("#mentor-grid img", (imgs) => Promise.all(imgs.map((img) => {
      img.loading = "eager";
      return img.complete ? img.naturalWidth === 0 : new Promise((r) => { img.onload = () => r(false); img.onerror = () => r(true); });
    })).then((list) => list.filter(Boolean).length));
    assert.equal(broken, 0);
    await closePage(page, assert);
  });
  test("FE-PUB-03 about: the team cards come from content.js, like the directory", async () => {
    const page = await open("about.html");
    assert.equal(await page.locator("#founders .member-card").count(), C.founders.length);
    assert.equal(await page.locator("#founders .member-name").first().textContent(), C.founders[0].name);
    await closePage(page, assert);
  });
});
