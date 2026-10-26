// Smoke tests against the LIVE site (https://beyondicmc.com) and its Supabase
// project. Read-only: nothing is saved, no email is sent, no key is needed.
// Run after every deploy: npm run test:smoke
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { SITE, liveConfig, callFunction } from "../helpers/live.mjs";
import { PAGES } from "../helpers/repo.mjs";

let c;
before(async () => { c = await liveConfig(); });
const get = (path, opts = {}) => fetch(SITE + path, { redirect: "manual", ...opts });

describe("SMK-SITE the published website", () => {
  test("SMK-SITE-01 every page and file is online", async () => {
    for (const p of [...PAGES, "css/styles.css", "js/content.js", "js/main.js", "js/members.js", "js/admin.js", "assets/img/placeholder-person.svg"]) {
      const res = await get("/" + p);
      assert.equal(res.status, 200, p);
    }
    assert.equal((await fetch(SITE + "/")).status, 200);
  });
  test("SMK-SITE-02 private files are not published", async () => {
    for (const p of ["README.md", "package.json", "vercel.json", "supabase/config.toml", "supabase/schema.sql", "tests/TESTPLAN.md", ".env", "scripts/build.mjs"]) {
      assert.equal((await get("/" + p)).status, 404, p);
    }
  });
  test("SMK-SITE-03 www goes to the main address; security headers; private pages not indexed", async () => {
    const www = await fetch(SITE.replace("://", "://www.") + "/login.html", { redirect: "manual" });
    assert.ok([301, 307, 308].includes(www.status));
    assert.equal(www.headers.get("location"), SITE + "/login.html");
    const admin = await get("/admin.html");
    assert.equal(admin.headers.get("x-frame-options"), "DENY");
    assert.equal(admin.headers.get("x-content-type-options"), "nosniff");
    assert.equal(admin.headers.get("x-robots-tag"), "noindex");
  });
  test("SMK-SITE-04 the site is connected to Supabase with the public key only", async () => {
    assert.match(c.supabaseUrl, /^https:\/\/[a-z0-9]+\.supabase\.co$/);
    assert.match(c.supabaseAnonKey, /^(sb_publishable_|eyJ)/);
    assert.doesNotMatch(c.supabaseAnonKey, /^sb_secret_/);
    if (c.supabaseAnonKey.startsWith("eyJ")) {
      const role = JSON.parse(Buffer.from(c.supabaseAnonKey.split(".")[1], "base64url")).role;
      assert.equal(role, "anon", "never the service_role key");
    }
  });
});

describe("SMK-API Supabase, as a visitor sees it", () => {
  test("SMK-API-01 the database is awake (keep-awake ping)", async () => {
    const res = await fetch(`${c.supabaseUrl}/rest/v1/rpc/beyond_ping`, { method: "POST", headers: { apikey: c.supabaseAnonKey, "Content-Type": "application/json" }, body: "{}" });
    assert.equal(res.status, 200);
    assert.equal(await res.json(), 1);
  });
  test("SMK-API-02 visitors can't read any Beyond data", async () => {
    for (const t of ["beyond_applications", "beyond_profiles", "beyond_invites", "beyond_audit_log", "beyond_rate_limits"]) {
      const res = await fetch(`${c.supabaseUrl}/rest/v1/${t}?select=*&limit=1`, { headers: { apikey: c.supabaseAnonKey } });
      const body = await res.json();
      assert.ok(res.status >= 400 || (Array.isArray(body) && body.length === 0), t + ": " + res.status);
    }
    const rpc = await fetch(`${c.supabaseUrl}/rest/v1/rpc/beyond_admin_list_members`, { method: "POST", headers: { apikey: c.supabaseAnonKey, "Content-Type": "application/json" }, body: "{}" });
    assert.ok(rpc.status >= 400);
  });
  test("SMK-API-03 member photos are private", async () => {
    const res = await fetch(`${c.supabaseUrl}/storage/v1/object/public/beyond-avatars/x/avatar.jpg`);
    assert.ok(res.status >= 400);
  });
  test("SMK-API-04 all four Edge Functions are online and refuse bad requests (nothing saved)", async () => {
    let r = await callFunction("beyond-apply", {});
    assert.deepEqual([r.status, r.data.error], [400, "invalid"]);
    r = await callFunction("beyond-apply", {}, { origin: "https://evil.example" });
    assert.equal(r.status, 403);
    r = await callFunction("beyond-password-reset", { email: "not-an-email" });
    assert.deepEqual([r.status, r.data.error], [400, "invalid"]);
    r = await callFunction("beyond-join", { action: "check", token: "short" });
    assert.deepEqual([r.status, r.data.error], [404, "invalid_token"]);
    r = await callFunction("beyond-admin", { action: "accept" });
    assert.deepEqual([r.status, r.data.error], [403, "not_admin"]);
    r = await callFunction("beyond-admin", { action: "accept" }, { token: "not-a-real-session" });
    assert.deepEqual([r.status, r.data.error], [403, "not_admin"]);
  });
  test("SMK-API-05 the functions answer the website's preflight (CORS)", async () => {
    const res = await fetch(`${c.supabaseUrl}/functions/v1/beyond-apply`, { method: "OPTIONS", headers: { Origin: SITE, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,apikey,authorization" } });
    assert.equal(res.headers.get("access-control-allow-origin"), SITE);
  });
});
