// BEYOND — sending email through Resend (https://resend.com, free plan:
// 3,000 emails a month, 100 a day). Emails go out as "Beyond <info@beyondicmc.com>";
// replies go to info@, which Cloudflare Email Routing forwards to Beyond's Gmail.
// We can't use the Supabase project's email settings: they belong to the other app too.
// Setup: verify beyondicmc.com in Resend (DNS records in Cloudflare), create an
// API key, and save it as the BEYOND_RESEND_API_KEY secret (see the README).

import { env } from "./env.ts";

export type Mail = { subject: string; html: string; text: string };

const DEFAULT_FROM = "Beyond <info@beyondicmc.com>";

function fromAddress(): string {
  return env("BEYOND_MAIL_FROM", DEFAULT_FROM);
}

// The bare address inside "Name <address>"
function bareAddress(from: string): string {
  const match = /<([^>]+)>/.exec(from);
  return (match ? match[1] : from).trim();
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

// Like send(), but never throws: returns the error message, or null when it was sent
export async function trySend(to: string, mail: Mail, replyTo?: string): Promise<string | null> {
  try {
    await send(to, mail, replyTo);
    return null;
  } catch (error) {
    console.error("Email to " + to + " failed", error);
    return String((error && (error as Error).message) || error).slice(0, 500);
  }
}
