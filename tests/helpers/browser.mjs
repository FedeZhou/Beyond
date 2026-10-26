// Starts a real browser for the frontend tests, using one that is already
// installed (no download): Microsoft Edge on Windows, Google Chrome on GitHub's
// test machines. Set BROWSER_CHANNEL (msedge / chrome / chromium) to choose.
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./server.mjs";

const SUPABASE_JS = readFileSync(join(ROOT, "node_modules/@supabase/supabase-js/dist/umd/supabase.js"));

export async function launch() {
  const channels = process.env.BROWSER_CHANNEL ? [process.env.BROWSER_CHANNEL] : ["msedge", "chrome", "chromium"];
  let lastError;
  for (const channel of channels) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error("No browser found (tried " + channels.join(", ") + "). Install Edge or Chrome. " + lastError.message);
}

// A new page that never touches the internet: fonts and the Turnstile widget
// are blocked, and the Supabase library comes from node_modules (same file and
// same integrity hash as the CDN copy). It also collects JavaScript errors.
export async function newPage(browser, { viewport = { width: 1280, height: 900 }, session = null } = {}) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  await context.route(/fonts\.(googleapis|gstatic)\.com|challenges\.cloudflare\.com/, (route) => route.abort());
  await context.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2\.45\.4\/dist\/umd\/supabase\.js/, (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: SUPABASE_JS, headers: { "Access-Control-Allow-Origin": "*" } }));
  if (session) {
    // Start already logged in (what Supabase keeps in localStorage after a login).
    // Only once per tab, so logging out really logs out.
    await context.addInitScript((value) => {
      if (sessionStorage.getItem("test-session-set")) return;
      localStorage.setItem("sb-mock-auth-token", value);
      sessionStorage.setItem("test-session-set", "1");
    }, JSON.stringify(session));
  }
  const page = await context.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    // The browser's own network lines: blocked fonts, a missing config.js in the
    // "no settings" test, and the HTTP errors the fake backend sends on purpose
    if (/config\.js|ERR_FAILED|Failed to load resource: the server responded with a status of \d{3}/.test(text)) return;
    page.errors.push("console: " + text);
  });
  page.on("dialog", (d) => d.accept());
  return page;
}

// Opens a page of the local site and waits until main.js has built the header
export async function openPage(browser, base, path, opts = {}) {
  const page = await newPage(browser, opts);
  if (opts.mock) await opts.mock(page);
  await page.goto(base + "/" + path);
  await page.waitForSelector("#site-nav", { state: "attached" });
  return page;
}

// Closes the page; fails the test if the page had JavaScript errors
export async function closePage(page, assert) {
  assert.deepEqual(page.errors, [], "JavaScript errors on " + page.url());
  await page.context().close();
}

// Sideways scrolling, in pixels (0 = fits the screen)
export const overflowX = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

export const navText = async (page) => (await page.locator("#site-nav").innerText()).replace(/\s+/g, " ").trim();
