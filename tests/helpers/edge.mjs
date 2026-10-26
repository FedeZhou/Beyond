// Runs the Edge Functions (supabase/functions/) inside Node for unit tests.
//   - a Deno stand-in: Deno.env and Deno.serve (which captures the handler)
//   - an in-memory stand-in for the Supabase database, auth and storage,
//     plugged in instead of _shared/db.ts (node:test module mocks)
//   - fetch() replaced: Resend and Cloudflare Turnstile are answered here,
//     so NO real email is ever sent and nothing reaches the internet.
import { mock } from "node:test";
import { randomUUID, createHash } from "node:crypto";

export const FUNCTIONS = new URL("../../supabase/functions/", import.meta.url);
export const SITE = "https://beyondicmc.com";
export const ADMIN_EMAIL = "info@beyondicmc.com";

// The functions log their warnings (caps reached, simulated errors): keep test output quiet
if (!process.env.DEBUG) { console.warn = () => {}; console.error = () => {}; }

/* ---------------- Deno stand-in ---------------- */
export const ENV = {};
export function resetEnv(extra = {}) {
  for (const k of Object.keys(ENV)) delete ENV[k];
  Object.assign(ENV, {
    SUPABASE_URL: "https://fake.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
    BEYOND_ALLOWED_ORIGINS: SITE + ",http://localhost:8000",
    BEYOND_SITE_URL: SITE,
    BEYOND_ADMIN_EMAIL: ADMIN_EMAIL,
    BEYOND_RESEND_API_KEY: "re_test",
    BEYOND_IP_SALT: "salt",
  }, extra);
}
resetEnv();
const handlers = [];
globalThis.Deno = {
  env: { get: (k) => ENV[k] },
  serve: (handler) => { handlers.push(handler); },
};

/* ---------------- In-memory database ---------------- */
export const store = {
  tables: {}, users: [], tokens: {}, files: {}, limits: {}, audit: [], emails: [], turnstileOk: true, failInsert: null,
  limitOverride: {},
};
export function resetStore() {
  store.tables = { beyond_applications: [], beyond_invites: [], beyond_profiles: [], beyond_audit_log: [] };
  store.users = []; store.tokens = {}; store.files = {}; store.limits = {}; store.audit = []; store.emails = [];
  store.turnstileOk = true; store.failInsert = null; store.limitOverride = {};
}
resetStore();

// What the database triggers do (supabase/002-applications.sql): an invited
// email gets a card, pre-filled from its application.
function prefill(profile, app) {
  if (!app || profile.onboarded_at) return;
  const a = app.answers || {};
  Object.assign(profile, {
    application_id: app.id, first_name: app.first_name, last_name: app.last_name, city: app.city, country: app.country,
    position: app.role === "mentor" ? a.position || "" : a.programme || "",
    company: app.role === "mentor" ? a.company || "" : a.school || "",
    studies: [app.role === "mentor" ? a.highest_degree : [a.school, a.programme].filter(Boolean).join(", ")].filter(Boolean),
  });
}
function giveCard(userId, invite) {
  let profile = store.tables.beyond_profiles.find((p) => p.id === userId);
  if (!profile) {
    profile = { id: userId, role: invite.role, status: "approved", first_name: "", last_name: "", onboarded_at: null, photo_path: null, is_listed: true };
    store.tables.beyond_profiles.push(profile);
  }
  prefill(profile, store.tables.beyond_applications.find((a) => a.id === invite.application_id));
}

class Query {
  constructor(table) { this.table = table; this.op = null; this.filters = []; this.payload = null; this.mode = "many"; this.returning = false; }
  get rows() { return (store.tables[this.table] ||= []); }
  select() { if (this.op) this.returning = true; else this.op = "select"; return this; }
  insert(v) { this.op = "insert"; this.payload = v; return this; }
  upsert(v) { this.op = "upsert"; this.payload = v; return this; }
  update(v) { this.op = "update"; this.payload = v; return this; }
  delete() { this.op = "delete"; return this; }
  eq(c, v) { this.filters.push((r) => r[c] === v); return this; }
  is(c, v) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
  like(c, p) { const re = new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$"); this.filters.push((r) => re.test(r[c] || "")); return this; }
  in(c, list) { this.filters.push((r) => list.includes(r[c])); return this; }
  order() { return this; }
  limit() { return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  then(resolve, reject) { try { resolve(this.run()); } catch (e) { reject(e); } }
  match() { return this.rows.filter((r) => this.filters.every((f) => f(r))); }
  run() {
    let data;
    if (this.op === "select") data = this.match();
    else if (this.op === "insert" || this.op === "upsert") {
      if (store.failInsert && store.failInsert.table === this.table) { const e = store.failInsert.error; store.failInsert = null; return { data: null, error: e }; }
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((r) => ({ id: randomUUID(), created_at: new Date().toISOString(), ...r }));
      for (const row of list) {
        if (this.table === "beyond_applications" && this.rows.some((x) => x.email === row.email && x.role === row.role && (x.status || "pending") === "pending")) {
          return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
        }
        if (this.table === "beyond_applications") row.status ||= "pending";
        if (this.table === "beyond_invites") {
          const existing = this.rows.findIndex((x) => x.email === row.email);
          if (existing !== -1) {
            if (this.op === "insert") return { data: null, error: { code: "23505", message: "duplicate key" } };
            this.rows.splice(existing, 1);
          }
          this.rows.push(row);
          const user = store.users.find((u) => u.email === row.email);
          if (user) giveCard(user.id, row);                         // beyond_handle_new_invite
          continue;
        }
        this.rows.push(row);
      }
      data = list;
    } else if (this.op === "update") {
      data = this.match();
      data.forEach((r) => Object.assign(r, this.payload));
    } else if (this.op === "delete") {
      data = this.match();
      store.tables[this.table] = this.rows.filter((r) => !data.includes(r));
    }
    const copy = data.map((r) => ({ ...r }));
    if (this.op !== "select" && !this.returning && this.mode === "many") return { data: null, error: null };
    if (this.mode === "single") return copy.length === 1 ? { data: copy[0], error: null } : { data: null, error: { code: "PGRST116", message: "not exactly one row" } };
    if (this.mode === "maybe") return { data: copy[0] ?? null, error: null };
    return { data: copy, error: null };
  }
}

export function addUser(email, { password = "Password-123", token = null } = {}) {
  const user = { id: randomUUID(), email: email.toLowerCase(), password };
  store.users.push(user);
  if (token) store.tokens[token] = user.id;
  const invite = store.tables.beyond_invites.find((i) => i.email === user.email);
  if (invite) giveCard(user.id, invite);                            // beyond_handle_new_user
  return user;
}
export function addAdmin(email = "admin@example.com", token = "admin-token") {
  store.tables.beyond_invites.push({ email, role: "admin" });
  const user = addUser(email, { token });
  store.tables.beyond_profiles.find((p) => p.id === user.id).onboarded_at = new Date().toISOString();
  return user;
}

const fakeClient = {
  from: (table) => new Query(table),
  rpc: async () => ({ data: null, error: null }),
  auth: {
    getUser: async (jwt) => {
      const user = store.users.find((u) => u.id === store.tokens[jwt]);
      return user ? { data: { user: { id: user.id, email: user.email } }, error: null } : { data: { user: null }, error: { message: "invalid JWT" } };
    },
    admin: {
      createUser: async ({ email, password }) => {
        if (store.users.some((u) => u.email === email)) return { data: null, error: { status: 422, message: "A user with this email address has already been registered" } };
        if ((password || "").length < 6) return { data: null, error: { status: 422, message: "Password should be at least 6 characters" } };
        return { data: { user: addUser(email, { password }) }, error: null };
      },
      getUserById: async (id) => {
        const user = store.users.find((u) => u.id === id);
        return { data: { user: user ? { id: user.id, email: user.email } : null }, error: null };
      },
      generateLink: async ({ type, email, options }) => ({
        data: { properties: { action_link: `https://fake.supabase.co/auth/v1/verify?token=abc&type=${type}&redirect_to=${options.redirectTo}&email=${email}` } },
        error: null,
      }),
    },
  },
  storage: {
    from: (bucket) => ({
      list: async (prefix) => ({ data: Object.keys(store.files).filter((p) => p.startsWith(prefix + "/")).map((p) => ({ name: p.slice(prefix.length + 1) })), error: null }),
      remove: async (paths) => { paths.forEach((p) => delete store.files[p]); return { data: [], error: null }; },
    }),
  },
};

// Counts like beyond_hit() in the database
async function withinLimit(bucket, max) {
  if (bucket in store.limitOverride) return store.limitOverride[bucket];
  store.limits[bucket] = (store.limits[bucket] || 0) + 1;
  return store.limits[bucket] <= max;
}

mock.module(new URL("_shared/db.ts", FUNCTIONS).href, {
  namedExports: {
    db: () => fakeClient,
    withinLimit,
    userIdByEmail: async (email) => (store.users.find((u) => u.email === email.toLowerCase()) || {}).id || null,
    audit: async (actor, action, target, details = {}) => { store.audit.push({ actor_email: actor && actor.email, action, target, details }); },
  },
});

/* ---------------- The internet: Resend and Turnstile only ---------------- */
export const resend = { failNext: null };
globalThis.fetch = async (url, options = {}) => {
  const u = String(url);
  if (u.startsWith("https://api.resend.com/emails")) {
    if (resend.failNext) { const f = resend.failNext; resend.failNext = null; return new Response(JSON.stringify(f.body || {}), { status: f.status }); }
    store.emails.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ id: "email-" + store.emails.length }), { status: 200 });
  }
  if (u.startsWith("https://challenges.cloudflare.com/turnstile/")) {
    return new Response(JSON.stringify({ success: store.turnstileOk }), { status: 200 });
  }
  throw new Error("Unexpected network call in a unit test: " + u);
};

/* ---------------- Calling a function ---------------- */
// Imports a function (once) and returns a caller: call(body, { origin, token, method, ip })
export async function loadFunction(name) {
  const before = handlers.length;
  await import(new URL(name + "/index.ts", FUNCTIONS).href);
  const handler = handlers[before];
  return async (body, { origin = SITE, token = null, method = "POST", ip = "203.0.113.7", raw = null } = {}) => {
    const headers = { "Content-Type": "application/json", "x-forwarded-for": ip };
    if (origin) headers.Origin = origin;
    if (token) headers.Authorization = "Bearer " + token;
    const req = new Request("https://fake.supabase.co/functions/v1/" + name, {
      method, headers, body: method === "POST" ? (raw ?? JSON.stringify(body ?? {})) : undefined,
    });
    const res = await handler(req);
    const text = await res.text();
    let data = {};
    try { data = JSON.parse(text); } catch { data = { text }; }
    return { status: res.status, data, headers: res.headers };
  };
}

export const sha256 = (t) => createHash("sha256").update(t).digest("hex");

/* ---------------- Sample answers ---------------- */
export function menteeFields(email = "mia@example.com", extra = {}) {
  return {
    first_name: "Mia", last_name: "Rossi", email, city: "Milan", country: "Italy",
    school: "Politecnico di Milano", programme: "BSc Aerospace Engineering", gpa: "28/30",
    field: "Engineering", field_other: "",
    goals: "An MSc abroad, then a career in the space industry with a mentor's help.",
    achievement: "Winning a regional physics olympiad while working in the family shop.",
    age_confirmed: true, consent: true, ...extra,
  };
}
export function mentorFields(email = "leo@example.com", extra = {}) {
  return {
    first_name: "Leo", last_name: "Chen", email, city: "Zurich", country: "Switzerland",
    company: "ETH Zurich", position: "Researcher", field: "Physics", field_other: "",
    highest_degree: "ETH Zurich, PhD Physics", linkedin: "https://www.linkedin.com/in/leo",
    motivation: "I grew up without role models in science and want to be one for others.",
    age_confirmed: true, consent: true, ...extra,
  };
}
