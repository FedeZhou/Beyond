// Static checks: syntax, settings files, build output, secrets, SQL rules
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, read, exists, PAGES, PRIVATE_PAGES, trackedFiles } from "../helpers/repo.mjs";

describe("S-SYN syntax and settings", () => {
  test("S-SYN-01 every JavaScript file parses", () => {
    const files = ["js/content.js", "js/main.js", "js/members.js", "js/admin.js", "js/hero-particles.js", "js/config.example.js", "scripts/build.mjs"];
    for (const f of files) execFileSync(process.execPath, ["--check", join(ROOT, f)]);
  });
  test("S-SYN-02 every Edge Function file parses (TypeScript)", () => {
    const dir = join(ROOT, "supabase/functions");
    const files = readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith(".ts"));
    assert.ok(files.length >= 11);
    for (const f of files) execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--check", join(dir, f)]);
  });
  test("S-SYN-03 vercel.json: build into dist/, no install, security headers, private pages not indexed", () => {
    const v = JSON.parse(read("vercel.json"));
    assert.equal(v.buildCommand, "node scripts/build.mjs");
    assert.equal(v.outputDirectory, "dist");
    assert.equal(v.installCommand, "");
    const all = v.headers.find((h) => h.source === "/(.*)").headers.map((h) => h.key);
    for (const k of ["X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options"]) assert.ok(all.includes(k), k);
    const noindex = v.headers.find((h) => h.headers.some((x) => x.key === "X-Robots-Tag"));
    for (const p of PRIVATE_PAGES) assert.ok(noindex.source.includes(p.replace(".html", "")), p);
  });
  test("S-SYN-04 every Edge Function checks the caller itself (verify_jwt = false), as the new Supabase keys need", () => {
    const toml = read("supabase/config.toml");
    const fns = readdirSync(join(ROOT, "supabase/functions")).filter((d) => d.startsWith("beyond-"));
    assert.deepEqual(fns.sort(), ["beyond-admin", "beyond-apply", "beyond-join", "beyond-password-reset"]);
    for (const f of fns) assert.match(toml, new RegExp("\\[functions\\." + f + "\\]\\s*\\nverify_jwt = false"), f);
    assert.match(toml, /^project_id = /m);
  });
  test("S-SYN-05 the pinned Supabase library matches the integrity hash in every page", () => {
    const hash = "sha384-" + createHash("sha384").update(readFileSync(join(ROOT, "node_modules/@supabase/supabase-js/dist/umd/supabase.js"))).digest("base64");
    const pkg = JSON.parse(read("package.json")).devDependencies["@supabase/supabase-js"];
    for (const p of PAGES) {
      const tag = /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@([\d.]+)\/[^"]+" integrity="([^"]+)"/.exec(read(p));
      if (!tag) continue;
      assert.equal(tag[1], pkg, p + ": same version as package.json");
      assert.equal(tag[2], hash, p + ": integrity hash");
    }
  });
});

describe("S-GATE the tests themselves run before every push", () => {
  test("S-GATE-01 the pre-push hook runs npm test for main, and npm install turns it on", () => {
    const hook = read(".githooks/pre-push");
    assert.match(hook, /^#!\/bin\/sh/);
    assert.match(hook, /refs\/heads\/main/);
    assert.match(hook, /npm test/);
    assert.doesNotMatch(hook, /\r/, "Unix line endings");
    assert.match(read(".gitattributes"), /\.githooks\/\* text eol=lf/);
    assert.equal(JSON.parse(read("package.json")).scripts.prepare, "git config core.hooksPath .githooks");
    const mode = execSync("git ls-files -s .githooks/pre-push", { cwd: ROOT }).toString();
    if (mode) assert.match(mode, /^100755/, "the hook is executable");
  });
  test("S-GATE-02 GitHub runs the same tests on every push to main", () => {
    const wf = read(".github/workflows/tests.yml");
    for (const s of ["npm run test:static", "npm run test:unit", "npm run test:frontend", "npm run test:smoke", "branches: [main]"]) assert.ok(wf.includes(s), s);
    assert.doesNotMatch(wf, /^\s*run:.*test:integration/m, "integration tests are never run automatically");
  });
});

describe("S-BLD build for Vercel (scripts/build.mjs)", () => {
  test("S-BLD-01 dist/ has every page and asset, config.js from the settings, nothing private", () => {
    const dist = join(ROOT, "dist");
    try {
      execFileSync(process.execPath, ["scripts/build.mjs"], { cwd: ROOT, env: { ...process.env, SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "sb_publishable_x" }, stdio: "pipe" });
      const files = readdirSync(dist);
      for (const p of PAGES) assert.ok(files.includes(p), p);
      for (const d of ["css", "js", "assets"]) assert.ok(files.includes(d), d);
      for (const bad of ["supabase", "README.md", "tests", "package.json", "node_modules", ".env", "scripts", "vercel.json", ".github"]) {
        assert.equal(files.includes(bad), false, bad + " must not be published");
      }
      assert.match(readFileSync(join(dist, "js/config.js"), "utf8"), /"supabaseUrl": "https:\/\/x\.supabase\.co"/);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });
  test("S-BLD-02 without the settings the build still works, with a clear warning", () => {
    const dist = join(ROOT, "dist");
    try {
      const env = { ...process.env }; delete env.SUPABASE_URL; delete env.SUPABASE_ANON_KEY;
      const out = execFileSync(process.execPath, ["scripts/build.mjs"], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
      assert.match(out.toString(), /Built the site/);
      assert.match(readFileSync(join(dist, "js/config.js"), "utf8"), /"supabaseUrl": ""/);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });
});

describe("S-SEC no secrets in the repository", () => {
  test("S-SEC-01 .env and js/config.js are ignored by git", () => {
    const ignored = execSync("git check-ignore .env js/config.js node_modules/x dist/x", { cwd: ROOT }).toString();
    for (const f of [".env", "js/config.js", "node_modules", "dist"]) assert.ok(ignored.includes(f), f);
  });
  test("S-SEC-02 no keys in any file that would be pushed", () => {
    const patterns = [
      [/sb_secret_[A-Za-z0-9_-]{10,}/, "Supabase secret key"],
      [/sb_publishable_[A-Za-z0-9_-]{20,}/, "Supabase publishable key (kept out of GitHub by choice)"],
      [/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJ[A-Za-z0-9_-]{20,}/, "Supabase JWT key"],
      [/\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{10,}/, "Resend API key"],
      [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
    ];
    const files = trackedFiles().filter((f) => !/^assets\/|\.(jpg|png|svg|ico)$|package-lock\.json$/.test(f) && existsSync(join(ROOT, f)));
    for (const f of files) {
      const text = read(f);
      for (const [re, what] of patterns) assert.doesNotMatch(text, re, `${what} found in ${f}`);
    }
  });
});

describe("S-SQL database rules (shared Supabase project)", () => {
  const sql = read("supabase/schema.sql") + "\n" + read("supabase/002-applications.sql") + "\n" + read("supabase/003-profile-about.sql");
  test("S-SQL-01 everything created is Beyond's own (beyond_ prefix)", () => {
    for (const m of sql.matchAll(/create (?:or replace )?(?:table|function|type|trigger|index|unique index)(?: if not exists)? (?:public\.)?(\w+)/gi)) {
      assert.match(m[1], /^beyond_/, m[0]);
    }
    for (const m of sql.matchAll(/create policy "([^"]+)"/gi)) assert.match(m[1], /^Beyond: /, m[0]);
    assert.match(sql, /'beyond-avatars'/);
  });
  test("S-SQL-02 nothing project-wide or destructive", () => {
    assert.doesNotMatch(sql, /\bdrop table\b|\btruncate\b|\balter role\b|\bdelete from auth\.|auth\.config|\balter table auth\./i);
    assert.doesNotMatch(sql, /update auth\.users/i);
  });
  test("S-SQL-03 every table has Row Level Security", () => {
    const tables = [...sql.matchAll(/create table (?:if not exists )?public\.(\w+)/gi)].map((m) => m[1]);
    for (const t of tables) assert.match(sql, new RegExp("alter table public\\." + t + "\\s+enable row level security"), t);
  });
  test("S-SQL-04 security-definer functions pin search_path and are locked down", () => {
    const PUBLIC_ON_PURPOSE = ["beyond_ping", "beyond_lines_ok"];   // keep-awake ping; pure check helper
    for (const m of sql.matchAll(/create (?:or replace )?function public\.(\w+)\(([^)]*)\)[\s\S]*?\$\$;/gi)) {
      const [whole, name] = m;
      assert.match(whole, /set search_path = ''/, name + ": search_path");
      if (PUBLIC_ON_PURPOSE.includes(name)) continue;
      assert.match(sql, new RegExp("revoke execute on function public\\." + name + "\\("), name + ": revoke execute");
    }
  });
  test("S-SQL-05 visitors (anon) get no rights on Beyond's tables", () => {
    assert.doesNotMatch(sql, /grant [^;]*\bon (?:table )?public\.beyond_\w+[^;]* to [^;]*\banon\b/i);
    for (const t of ["beyond_applications", "beyond_invites", "beyond_profiles", "beyond_audit_log", "beyond_rate_limits"]) {
      assert.match(sql, new RegExp("revoke all on public\\." + t + "\\s+from anon"), t);
    }
  });
  test("S-SQL-06 the 3-second save limit never blocks a member's first save", () => {
    assert.match(read("supabase/002-applications.sql"), /if old\.onboarded_at is not null and old\.updated_at > now\(\) - interval '3 seconds'/);
  });
});
