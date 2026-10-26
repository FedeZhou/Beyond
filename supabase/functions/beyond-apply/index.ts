// BEYOND — beyond-apply
// Receives a mentor or mentee application from the website (js/main.js),
// saves it in beyond_applications, then emails the admin (every answer) and
// the applicant (a confirmation with a copy of their answers).
//
// Called by anyone, without signing in, so it checks a lot first:
//   the website's address (CORS), the spam trap, Cloudflare Turnstile,
//   every answer, and at most 5 applications an hour from one connection
//   and 3 a day for one email address.
//
// Answers: 200 { ok }  ·  400 { error: "invalid", fields } or { error: "captcha" }
//          409 { error: "duplicate" }  ·  429 { error: "rate_limited" }

import { adminNotification, applicantConfirmation } from "../_shared/templates.ts";
import { clientIp, corsHeaders, guard, ipHash, json, readJson, str } from "../_shared/http.ts";
import { db, withinLimit } from "../_shared/db.ts";
import { env, siteUrl } from "../_shared/env.ts";
import { isRole, parseApplication } from "../_shared/application.ts";
import { passesTurnstile } from "../_shared/turnstile.ts";
import { isTestAddress, trySend } from "../_shared/mail.ts";

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const stop = guard(req, cors);
  if (stop) return stop;

  try {
    const body = await readJson(req);
    if (!body || !isRole(body.role) || !body.fields || typeof body.fields !== "object") {
      return json({ error: "invalid", fields: [] }, 400, cors);
    }

    // Spam trap: people never fill it. Pretend all went well.
    if (str(body.honeypot)) return json({ ok: true }, 200, cors);

    const parsed = parseApplication(body.role, body.fields as Record<string, unknown>);
    if (!parsed.ok) return json({ error: "invalid", fields: parsed.invalid }, 400, cors);
    const app = parsed.application;

    if (!(await passesTurnstile(str(body.turnstileToken), clientIp(req)))) {
      return json({ error: "captcha" }, 400, cors);
    }

    const ip = await ipHash(req);
    if (!(await withinLimit("apply:ip:" + ip, 5, "1 hour")) ||
        !(await withinLimit("apply:email:" + app.email, 3, "1 day"))) {
      return json({ error: "rate_limited" }, 429, cors);
    }

    const { data: row, error } = await db().from("beyond_applications").insert({
      role: app.role,
      email: app.email,
      first_name: app.first_name,
      last_name: app.last_name,
      city: app.city,
      country: app.country,
      answers: app.answers,
      age_confirmed: true,
      ip_hash: ip,
    }).select("id").single();

    if (error) {
      if (error.code === "23505") return json({ error: "duplicate" }, 409, cors);   // already a pending one
      throw error;
    }

    // The application is saved: an email that fails is noted, not reported to the visitor.
    // Test applications (Resend's never-delivered …@resend.dev addresses) don't
    // notify the real admin inbox either, so automatic tests can't fill it.
    const reviewUrl = siteUrl() + "/admin.html#application=" + row.id;
    const adminTo = isTestAddress(app.email) ? "delivered+admin@resend.dev" : env("BEYOND_ADMIN_EMAIL");
    const [adminError, applicantError] = await Promise.all([
      trySend(adminTo, adminNotification(app, reviewUrl), app.email),
      trySend(app.email, applicantConfirmation(app)),
    ]);
    const now = new Date().toISOString();
    await db().from("beyond_applications").update({
      admin_notified_at: adminError ? null : now,
      confirmation_sent_at: applicantError ? null : now,
      last_email_error: adminError || applicantError || null,
    }).eq("id", row.id);

    return json({ ok: true }, 200, cors);
  } catch (error) {
    console.error("beyond-apply failed", error);
    return json({ error: "server" }, 500, cors);
  }
});
