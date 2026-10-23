// BEYOND — Cloudflare Turnstile (free "are you a person?" check) on the forms.
// Without the BEYOND_TURNSTILE_SECRET secret the check is skipped: fine for
// testing, but turn it on for the live site, because every application sends
// an email to the address typed in the form.

import { env } from "./env.ts";

export async function passesTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = env("BEYOND_TURNSTILE_SECRET", "");
  if (!secret) {
    console.warn("BEYOND_TURNSTILE_SECRET is not set: the spam check is off.");
    return true;
  }
  if (!token) return false;
  try {
    const form = new FormData();
    form.append("secret", secret);
    form.append("response", token);
    if (ip && ip !== "unknown") form.append("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const data = await res.json();
    return data && data.success === true;
  } catch (error) {
    console.error("Turnstile check failed", error);
    return false;
  }
}
