// Helpers for tests against the LIVE site and Supabase project (smoke and
// integration tests). Settings come from the live site itself, the
// environment, or your local .env; nothing secret is ever printed.
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { ROOT } from "./server.mjs";

export const SITE = (process.env.BEYOND_SITE_URL || "https://beyondicmc.com").replace(/\/+$/, "");

// Supabase address and publishable key, as the live site publishes them
let config = null;
export async function liveConfig() {
  if (!config) {
    const res = await fetch(SITE + "/js/config.js");
    const text = await res.text();
    const json = /window\.BEYOND_CONFIG = (\{[\s\S]*?\});/.exec(text);
    if (!json) throw new Error("Couldn't read js/config.js from " + SITE);
    config = JSON.parse(json[1]);
    config.ref = /^https:\/\/([^.]+)\./.exec(config.supabaseUrl)[1];
  }
  return config;
}

// The service_role key, for setting up and cleaning test data (integration only).
// From SUPABASE_SERVICE_ROLE_KEY, or from the Supabase CLI if you are logged in.
let serviceKey = null;
export function serviceRoleKey(ref) {
  if (serviceKey) return serviceKey;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return (serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY);
  try {
    const out = execSync(`npx --yes supabase projects api-keys --project-ref ${ref} -o json`, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"], timeout: 120000 }).toString();
    serviceKey = JSON.parse(out).find((k) => k.name === "service_role").api_key;
    return serviceKey;
  } catch {
    throw new Error("No service key: set SUPABASE_SERVICE_ROLE_KEY, or log in with `npx supabase login` (see tests/TESTPLAN.md).");
  }
}

// Calls a Beyond Edge Function like the website does
export async function callFunction(name, body, { origin = SITE, token = null } = {}) {
  const c = await liveConfig();
  const headers = { "Content-Type": "application/json", apikey: c.supabaseAnonKey, Authorization: "Bearer " + (token || c.supabaseAnonKey) };
  if (origin) headers.Origin = origin;
  const res = await fetch(`${c.supabaseUrl}/functions/v1/${name}`, { method: "POST", headers, body: JSON.stringify(body) });
  let data = {};
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data };
}

/* ------------------------------------------------------------------------
   Integration runs are limited, so testing never looks like spam to anyone:
   at least MIN_MINUTES between runs and at most MAX_PER_DAY runs a day.
   (Each run sends about 10 emails, all to Resend's never-delivered
   …@resend.dev test inbox, and makes 3 applications: the site allows 5 an
   hour from one connection.)
   ------------------------------------------------------------------------ */
export const MIN_MINUTES = 60;
export const MAX_PER_DAY = 4;
const RUNS = join(ROOT, "tests/.integration-runs.json");

export function checkRunBudget() {
  const now = Date.now();
  const runs = existsSync(RUNS) ? JSON.parse(readFileSync(RUNS, "utf8")).filter((t) => now - t < 864e5) : [];
  const last = runs.at(-1);
  if (last && now - last < MIN_MINUTES * 60e3) {
    const wait = Math.ceil((MIN_MINUTES * 60e3 - (now - last)) / 60e3);
    return { ok: false, reason: `the last integration run was less than ${MIN_MINUTES} minutes ago: wait ${wait} more minute(s)` };
  }
  if (runs.length >= MAX_PER_DAY) return { ok: false, reason: `already ${MAX_PER_DAY} integration runs in the last 24 hours` };
  return { ok: true, record: () => import("node:fs").then((fs) => fs.writeFileSync(RUNS, JSON.stringify([...runs, now]))) };
}

export function readDotEnv() {
  const file = join(ROOT, ".env");
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}
