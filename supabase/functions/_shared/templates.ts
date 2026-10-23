// BEYOND — the emails. Each one has an HTML version and a plain-text version.
// EDIT HERE to change the wording. Every value typed by a visitor is escaped.

import { answerList, type Application } from "./application.ts";
import { JOIN_LINK_DAYS } from "./env.ts";
import type { Mail } from "./mail.ts";

const NAVY = "#051C2C";
const BLUE = "#2251FF";
const GREY = "#5A6270";

function esc(value: unknown): string {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Keeps line breaks of long answers
function escLines(value: string): string {
  return esc(value).replace(/\n/g, "<br>");
}

function roleName(role: string): string {
  return role === "mentor" ? "mentor" : "mentee";
}

// The frame around every email: navy band with the wordmark, then the content
function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#F5F6F7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F6F7;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;">
        <tr><td style="background:${NAVY};padding:20px 28px;font-family:Georgia,serif;font-size:22px;color:#FFFFFF;">Beyond</td></tr>
        <tr><td style="padding:28px;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#0B0F14;">
          ${body}
        </td></tr>
        <tr><td style="padding:16px 28px 24px;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:${GREY};border-top:1px solid #E0E3E7;">
          Beyond · Italian-Chinese Mentorship Community
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function heading(text: string): string {
  return `<h1 style="margin:0 0 16px;font-family:Georgia,serif;font-weight:400;font-size:26px;line-height:1.25;color:${NAVY};">${esc(text)}</h1>`;
}

function para(html: string): string {
  return `<p style="margin:0 0 16px;">${html}</p>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0;"><a href="${esc(href)}" style="display:inline-block;padding:14px 22px;background:${BLUE};color:#FFFFFF;text-decoration:none;font-weight:600;">${esc(label)}</a></p>`;
}

function note(message: string): string {
  return `<p style="margin:0 0 16px;padding:14px 16px;background:#F5F6F7;border-left:3px solid ${BLUE};">${escLines(message)}</p>`;
}

function answersTable(app: Application): string {
  const rows = answerList(app).map((a) =>
    `<tr>
      <td style="padding:10px 12px 10px 0;vertical-align:top;width:38%;font-size:13px;font-weight:700;color:${GREY};border-top:1px solid #E0E3E7;">${esc(a.label)}</td>
      <td style="padding:10px 0;vertical-align:top;font-size:15px;border-top:1px solid #E0E3E7;">${escLines(a.value)}</td>
    </tr>`
  ).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;border-bottom:1px solid #E0E3E7;">${rows}</table>`;
}

function answersText(app: Application): string {
  return answerList(app).map((a) => a.label + ":\n" + a.value).join("\n\n");
}

/* --------------------------------------------------------------------------
   To the person who applied: thank you, and a copy of the answers
   -------------------------------------------------------------------------- */
export function applicantConfirmation(app: Application): Mail {
  const subject = "We received your Beyond application";
  const intro = `Thank you for applying to Beyond as a ${roleName(app.role)}. We read every application personally and will get back to you by email soon.`;
  return {
    subject,
    html: layout(subject,
      heading(`Thank you, ${app.first_name}.`) +
      para(esc(intro)) +
      para("Here is a copy of what you sent us:") +
      answersTable(app) +
      para(`<span style="color:${GREY};font-size:14px;">If something is wrong, just reply to this email.</span>`)),
    text: `Thank you, ${app.first_name}.\n\n${intro}\n\nHere is a copy of what you sent us:\n\n${answersText(app)}\n\nIf something is wrong, just reply to this email.\n\nBeyond`,
  };
}

/* --------------------------------------------------------------------------
   To the admin: a new application, with every answer
   -------------------------------------------------------------------------- */
export function adminNotification(app: Application, reviewUrl: string): Mail {
  const name = `${app.first_name} ${app.last_name}`;
  const subject = `New ${roleName(app.role)} application: ${name}`;
  return {
    subject,
    html: layout(subject,
      heading(`New ${roleName(app.role)} application`) +
      para(`<strong>${esc(name)}</strong> · ${esc(app.city)}, ${esc(app.country)}`) +
      answersTable(app) +
      button(reviewUrl, "Review in the admin portal") +
      para(`<span style="color:${GREY};font-size:14px;">Replying to this email writes to ${esc(app.email)}.</span>`)),
    text: `New ${roleName(app.role)} application: ${name}\n\n${answersText(app)}\n\nReview it: ${reviewUrl}`,
  };
}

/* --------------------------------------------------------------------------
   Accepted: welcome, and the join link
   -------------------------------------------------------------------------- */
export function acceptance(app: Application, joinUrl: string, message: string): Mail {
  const subject = "Welcome to Beyond";
  const steps = "Open the link below, choose a password, and check your card: we have already filled it in from your application. You can add a photo too. Once you save it, you appear in the members directory.";
  const expiry = `The link works for ${JOIN_LINK_DAYS} days. If it expires, just reply to this email.`;
  return {
    subject,
    html: layout(subject,
      heading(`Welcome to Beyond, ${app.first_name}!`) +
      para(`We are happy to tell you that your application as a ${roleName(app.role)} has been accepted.`) +
      (message ? note(message) : "") +
      para(esc(steps)) +
      button(joinUrl, "Join Beyond") +
      para(`<span style="color:${GREY};font-size:14px;">${esc(expiry)}<br>If the button doesn't work, copy this address into your browser:<br><a href="${esc(joinUrl)}" style="color:${BLUE};word-break:break-all;">${esc(joinUrl)}</a></span>`)),
    text: `Welcome to Beyond, ${app.first_name}!\n\nWe are happy to tell you that your application as a ${roleName(app.role)} has been accepted.\n\n${message ? message + "\n\n" : ""}${steps}\n\nJoin Beyond: ${joinUrl}\n\n${expiry}\n\nBeyond`,
  };
}

/* --------------------------------------------------------------------------
   Not accepted (only sent when the admin ticks the box)
   -------------------------------------------------------------------------- */
export function rejection(app: Application, message: string): Mail {
  const subject = "Your Beyond application";
  const body = "Thank you for applying to Beyond and for the time you put into your application. After reading it carefully, we are not able to offer you a place at this time.";
  const close = "We wish you all the best on your path, and you are welcome to apply again in the future.";
  return {
    subject,
    html: layout(subject,
      heading(`Dear ${app.first_name},`) +
      para(esc(body)) +
      (message ? note(message) : "") +
      para(esc(close)) +
      para("The Beyond team")),
    text: `Dear ${app.first_name},\n\n${body}\n\n${message ? message + "\n\n" : ""}${close}\n\nThe Beyond team`,
  };
}

/* --------------------------------------------------------------------------
   Forgot password
   -------------------------------------------------------------------------- */
export function passwordReset(firstName: string, link: string): Mail {
  const subject = "Choose a new Beyond password";
  const hello = firstName ? `Hi ${firstName},` : "Hi,";
  const body = "Someone (hopefully you) asked to reset the password of your Beyond account. Open the link below to choose a new one. It works for a short time and only once.";
  const ignore = "If you didn't ask for this, you can ignore this email: your password stays the same.";
  return {
    subject,
    html: layout(subject,
      heading(hello) +
      para(esc(body)) +
      button(link, "Choose a new password") +
      para(`<span style="color:${GREY};font-size:14px;">${esc(ignore)}</span>`)),
    text: `${hello}\n\n${body}\n\n${link}\n\n${ignore}\n\nBeyond`,
  };
}
