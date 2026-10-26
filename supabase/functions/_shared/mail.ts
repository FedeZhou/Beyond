// BEYOND — sending email through Resend (https://resend.com, free plan:
// 3,000 emails a month, 100 a day). Emails go out as "Beyond <info@beyondicmc.com>";
// replies go to info@, which Cloudflare Email Routing forwards to Beyond's Gmail.
// We can't use the Supabase project's email settings: they belong to the other app too.
// Setup: verify beyondicmc.com in Resend (DNS records in Cloudflare), create an
// API key, and save it as the BEYOND_RESEND_API_KEY secret (see the README).
//
// SAFETY CAPS (so neither a bot nor a test run can flood an inbox, get the
// domain flagged as spam, or use up the Resend quota):
//   - at most MAX_PER_HOUR / MAX_PER_DAY emails in total,
//   - at most MAX_PER_RECIPIENT_DAY emails a day to the same address
//     (the admin address, which gets one notification per application, is
//     only held to the totals).
// Over a cap the email is NOT sent; trySend() returns the reason, which the
// admin portal shows ("Last email problem"), and nothing else breaks.
// Resend's test addresses (…@resend.dev) are accepted but never delivered:
// the automatic tests use them, so they never reach a real inbox.

import { env } from "./env.ts";
import { withinLimit } from "./db.ts";

export type Mail = { subject: string; html: string; text: string };

export const MAX_PER_HOUR = 30;
export const MAX_PER_DAY = 90;               // Resend free plan: 100 a day
export const MAX_PER_RECIPIENT_DAY = 5;

const DEFAULT_FROM = "Beyond <info@beyondicmc.com>";

function fromAddress(): string {
  return env("BEYOND_MAIL_FROM", DEFAULT_FROM);
}

// The bare address inside "Name <address>"
function bareAddress(from: string): string {
  const match = /<([^>]+)>/.exec(from);
  return (match ? match[1] : from).trim();
}

// Resend's test inbox: accepted, never delivered to anyone
export function isTestAddress(email: string): boolean {
  return /@resend\.dev$/i.test(email.trim());
}

export async function send(to: string, mail: Mail, replyTo?: string): Promise<void> {
  const from = fromAddress();
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env("BEYOND_RESEND_API_KEY"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: replyTo || bareAddress(from),
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error("Resend " + res.status + ": " + detail.slice(0, 300));
  }
}

// Checks the safety caps; returns the reason when this email must not be sent
async function overCap(to: string): Promise<string | null> {
  const address = to.trim().toLowerCase();
  const isAdmin = address === env("BEYOND_ADMIN_EMAIL", "").trim().toLowerCase();
  if (!isAdmin && !(await withinLimit("mail:to:" + address, MAX_PER_RECIPIENT_DAY, "1 day"))) {
    return "Not sent: daily limit of " + MAX_PER_RECIPIENT_DAY + " emails to " + address + " reached";
  }
  if (!(await withinLimit("mail:hour", MAX_PER_HOUR, "1 hour"))) {
    return "Not sent: limit of " + MAX_PER_HOUR + " emails an hour reached";
  }
  if (!(await withinLimit("mail:day", MAX_PER_DAY, "1 day"))) {
    return "Not sent: limit of " + MAX_PER_DAY + " emails a day reached";
  }
  return null;
}

// Like send(), but never throws: returns the problem, or null when it was sent
export async function trySend(to: string, mail: Mail, replyTo?: string): Promise<string | null> {
  try {
    const capped = await overCap(to);
    if (capped) {
      console.warn(capped);
      return capped;
    }
    await send(to, mail, replyTo);
    return null;
  } catch (error) {
    console.error("Email to " + to + " failed", error);
    return String((error && (error as Error).message) || error).slice(0, 500);
  }
}
