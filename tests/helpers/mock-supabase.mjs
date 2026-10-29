// A fake Supabase for the frontend tests. The pages run their real code
// (js/main.js, members.js, admin.js and the real supabase-js library), but every
// request to https://mock.supabase.co is answered here, from the routes the test
// gives. Every request is recorded in `calls`, so tests can check exactly what
// the page sent. Nothing ever reaches the real Supabase, Resend or Gmail.
import { MOCK_URL } from "./server.mjs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
  "Access-Control-Expose-Headers": "*",
};
// 1×1 PNG for photos
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

function b64url(obj) { return Buffer.from(JSON.stringify(obj)).toString("base64url"); }

export function user(id = "user-1", email = "member@example.com") {
  return { id, aud: "authenticated", role: "authenticated", email, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
}
// What supabase-js stores after a login (and what /auth/v1/token returns)
export function session(u = user()) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: [b64url({ alg: "HS256", typ: "JWT" }), b64url({ sub: u.id, email: u.email, exp, role: "authenticated" }), "sig"].join("."),
    token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: "refresh-" + u.id, user: u,
  };
}

export function profile(overrides = {}) {
  return {
    id: "user-1", role: "mentee", status: "approved", is_listed: true,
    first_name: "Mia", last_name: "Rossi", city: "Milan", country: "Italy",
    position: "BSc Aerospace Engineering", company: "Politecnico di Milano",
    studies: ["Politecnico di Milano, BSc Aerospace Engineering"], experience: [],
    description: "", linkedin: "",
    photo_path: null, onboarded_at: "2026-01-02T00:00:00Z", ...overrides,
  };
}

// routes: { "METHOD /path": handler | value, "METHOD /prefix*": ... }
// A handler gets { method, path, query, body, headers } and returns
// { status, json } or { status, body, contentType }, or a plain value (→ 200 JSON).
export async function mockSupabase(page, routes = {}) {
  const calls = [];
  const all = {
    "POST /auth/v1/logout": { status: 204 },
    "GET /storage/v1/object/sign/*": { status: 200, body: PIXEL, contentType: "image/png" },
    "POST /storage/v1/object/sign/beyond-avatars": (c) => (c.body.paths || []).map((p) => ({ path: p, signedURL: "/object/sign/beyond-avatars/" + p + "?token=t", error: null })),
    ...routes,
  };
  await page.context().route(MOCK_URL + "/**", (route) => answer(route).catch((error) => {
    // The page closed while a request was still being answered (end of a test): ignore
    if (!/closed|destroyed/i.test(String(error && error.message))) throw error;
  }));
  async function answer(route) {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    let body = null;
    try { body = req.postDataJSON(); } catch { body = req.postData(); }
    const call = { method, path: url.pathname, query: url.searchParams, body, headers: req.headers() };
    calls.push(call);
    const key = method + " " + url.pathname;
    let handler = all[key];
    if (handler === undefined) {
      const prefix = Object.keys(all).find((k) => k.endsWith("*") && key.startsWith(k.slice(0, -1)));
      handler = prefix ? all[prefix] : undefined;
    }
    if (handler === undefined) {
      return route.fulfill({ status: 404, headers: CORS, contentType: "application/json", body: JSON.stringify({ message: "no mock for " + key }) });
    }
    let result = typeof handler === "function" ? await handler(call) : handler;
    if (!result || typeof result !== "object" || !("status" in result) || Array.isArray(result)) result = { status: 200, json: result };
    const wantsObject = /vnd\.pgrst\.object/.test(call.headers.accept || "");
    if (wantsObject && Array.isArray(result.json)) result.json = result.json[0] ?? null;
    if (result.status === 204) return route.fulfill({ status: 204, headers: CORS });
    return route.fulfill({
      status: result.status,
      headers: CORS,
      contentType: result.contentType || "application/json",
      body: result.body !== undefined ? result.body : JSON.stringify(result.json ?? null),
    });
  }
  return {
    calls,
    find: (method, path) => calls.filter((c) => c.method === method && c.path === path),
    last: (method, path) => calls.filter((c) => c.method === method && c.path === path).at(-1),
  };
}

// The usual answers for a logged-in member: their own profile and the directory
export function memberRoutes({ me = profile(), others = [], isAdmin = false } = {}) {
  return {
    "GET /rest/v1/beyond_profiles": (c) => {
      const id = (c.query.get("id") || "").replace(/^eq\./, "");
      const rows = [me, ...others];
      return id ? rows.filter((r) => r.id === id) : rows;
    },
    "PATCH /rest/v1/beyond_profiles": { status: 204 },
    "POST /rest/v1/rpc/beyond_is_admin": isAdmin,
    "POST /storage/v1/object/beyond-avatars/*": { status: 200, json: { Key: "beyond-avatars/x" } },
    "DELETE /storage/v1/object/beyond-avatars": [],
  };
}
