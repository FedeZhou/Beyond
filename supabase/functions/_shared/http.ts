// BEYOND — small HTTP helpers shared by the Edge Functions:
// CORS (only Beyond's own website may call them), JSON in and out, IP hashing.

import { env } from "./env.ts";

const MAX_BODY_BYTES = 32 * 1024;

// The secret is a list of addresses. Commas are the documented separator, but spaces,
// semicolons and new lines work too: the Supabase dashboard can turn commas into spaces
// on paste, and then no address matched and every form on the site failed.
function allowedOrigins(): string[] {
  return env("BEYOND_ALLOWED_ORIGINS", "")
    .replace(/["']/g, "")
    .split(/[\s,;]+/)
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (allowedOrigins().includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export function isAllowedOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  // Browsers always send Origin on these cross-site POSTs; anything else is not our website
  return !!origin && allowedOrigins().includes(origin);
}

export function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}

// Answers the CORS preflight and refuses anything that isn't a POST from the website.
// Returns a Response to send straight away, or null to carry on.
export function guard(req: Request, cors: Record<string, string>): Response | null {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);
  if (!isAllowedOrigin(req)) return json({ error: "origin_not_allowed" }, 403, cors);
  return null;
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "unknown";
}

export async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Never store the raw address: a salted hash is enough to count requests
export function ipHash(req: Request): Promise<string> {
  return sha256(env("BEYOND_IP_SALT", "beyond") + "|" + clientIp(req));
}

// 32 random bytes, URL-safe: the secret part of a join link
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
