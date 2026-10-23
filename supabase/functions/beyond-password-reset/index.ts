// BEYOND — beyond-password-reset
// "Forgot password?" on members.html. Emails a one-time link to
// reset-password.html, through Resend as info@beyondicmc.com (the Supabase project's own
// email templates belong to the other app too, so they are not used).
//
//   { email } → always { ok: true }, whether or not the email is a member,
//               so nobody can use it to find out who is in Beyond.
// Limits: 5 requests an hour from one connection, 3 an hour for one email.

import { corsHeaders, guard, ipHash, json, readJson, str } from "../_shared/http.ts";
import { db, userIdByEmail, withinLimit } from "../_shared/db.ts";
import { siteUrl } from "../_shared/env.ts";
import { passwordReset } from "../_shared/templates.ts";
import { trySend } from "../_shared/mail.ts";

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const stop = guard(req, cors);
  if (stop) return stop;

  try {
    const body = await readJson(req);
    const email = str(body && body.email).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return json({ error: "invalid" }, 400, cors);
    }
    if (!(await withinLimit("reset:ip:" + (await ipHash(req)), 5, "1 hour"))) {
      return json({ error: "rate_limited" }, 429, cors);
    }
    // Over the per-email limit: answer as usual, send nothing
    if (!(await withinLimit("reset:email:" + email, 3, "1 hour"))) return json({ ok: true }, 200, cors);

    // Only Beyond members (people with a Beyond card) get a link
    const userId = await userIdByEmail(email);
    if (!userId) return json({ ok: true }, 200, cors);
    const { data: profile } = await db().from("beyond_profiles")
      .select("first_name, status").eq("id", userId).maybeSingle();
    if (!profile || profile.status !== "approved") return json({ ok: true }, 200, cors);

    const { data, error } = await db().auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: siteUrl() + "/reset-password.html" },
    });
    if (error || !data || !data.properties) throw error || new Error("No link");

    await trySend(email, passwordReset(profile.first_name, data.properties.action_link));
    return json({ ok: true }, 200, cors);
  } catch (error) {
    console.error("beyond-password-reset failed", error);
    return json({ error: "server" }, 500, cors);
  }
});
