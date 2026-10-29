# Beyond: regression test plan

This folder holds the automatic tests for the whole site: the pages, the members area, the admin portal, the Supabase Edge Functions and the database rules. They exist so that a change in one place can't silently break something somewhere else.

**The short version**
- `npm install` once. From then on, `git push` to `main` runs the tests first and refuses to push if one fails.
- Changed something in `supabase/`? Deploy it, then run `npm run test:integration`.
- Just published? `npm run test:smoke` checks the live site in a minute.

---

## 1. Test levels

| Level | Command | What it covers | Runs | Network | Emails sent | Keys needed | Time |
|---|---|---|---|---|---|---|---|
| **Static** | `npm run test:static` | Files agree with each other: forms ↔ server checks ↔ admin labels, page ids ↔ JavaScript, texts ↔ `content.js`, links, accessibility basics, build output, SQL rules, no secrets in the repo | before every push, GitHub | none | 0 | none | ~3 s |
| **Unit** | `npm run test:unit` | The 4 Edge Functions and their shared code, run in Node with an in-memory database, fake Resend and fake Turnstile | before every push, GitHub | none | 0 | none | ~3 s |
| **Browser** | `npm run test:frontend` | Every page in a real browser (Edge locally, Chrome on GitHub), the real site code and Supabase library, with a fake backend | before every push, GitHub | none (local server) | 0 | none | ~50 s |
| **Smoke** | `npm run test:smoke` | The live site and Supabase as a visitor sees them: pages online, private files hidden, headers, functions online and refusing bad requests, data private | after each deploy, daily on GitHub | live, read-only | 0 | none | ~15 s |
| **Integration** | `npm run test:integration` | The whole journey on the live backend (apply → accept → join → profile → directory → password reset → every admin action, with the real database rules and triggers), then the **real website clicked through in a browser** (both forms, login, admin portal, join link, photo, directory, log out, forgot password) | by hand, after changing `supabase/` or before/after a big release | live | ~15, all to `…@resend.dev` (never delivered) | Supabase CLI login or `SUPABASE_SERVICE_ROLE_KEY` | ~2 min |

`npm test` = static + unit + browser. That's what the pre-push hook and GitHub run.

## 2. No spam, ever

Gmail has blocked this project before because of test emails, so the tests follow strict rules:

1. **Static, unit and browser tests send nothing.** Every email, Supabase and Turnstile call is answered by a fake (`tests/helpers/edge.mjs`, `tests/helpers/mock-supabase.mjs`). An unexpected network call fails the unit test.
2. **Smoke tests never save or send anything.** They only send requests the server refuses before touching the database.
3. **Integration tests only email Resend's test inbox** (`delivered+beyond-it-<run>-<who>@resend.dev`). Resend accepts these emails but never delivers them to anyone.
   - For a test application, `beyond-apply` sends the "new application" notification to `delivered+admin@resend.dev` instead of `info@`, so the real admin inbox and Gmail are never involved.
   - Runs are limited: **at least 60 minutes apart, at most 4 a day** (checked by `tests/integration/run.mjs`; the test files refuse to run without it). A run makes exactly 5 applications, the most the site accepts from one connection in an hour.
   - Resend's test addresses only count toward the email totals, not the per-address cap below, because they are never delivered.
   - Everything a run creates is deleted at the end, even when a test fails.
4. **The live site itself has email safety caps** (`supabase/functions/_shared/mail.ts`):

   | Cap | Value |
   |---|---|
   | Total emails per hour | 30 |
   | Total emails per day | 90 (Resend's free plan allows 100) |
   | Emails per day to the same address | 5 (the admin address is only held to the totals) |

   Over a cap, the email isn't sent and the admin portal shows why. The application is still saved. These caps also protect against a bot flooding the forms.

## 3. What is tested, feature by feature

Test ids: `S-` static, `U-` unit (shared code), `F-` unit (Edge Function), `FE-` browser, `SMK-` smoke, `INT-` integration (backend), `LIVE-` integration (real website in a browser).

| Feature | Static | Unit | Browser | Live |
|---|---|---|---|---|
| **Every page**: loads without JavaScript errors, no sideways scrolling on phones, title, structure, skip link, labels, image alt text, unique ids | S-PG-01…09 | | FE-ALL-01, 05 | SMK-SITE-01 |
| **Menu**: Login when logged out; Directory and My profile when logged in; current page marked; phone menu (Escape, focus) | S-PG-07, S-REF-03 | | FE-ALL-02, 04, FE-NAV-01 | |
| **Footer**: contact email, year, legal links | S-REF-04 | | FE-ALL-03 | |
| **Home and About**: mentor cards from `content.js`, carousel arrows, tap for colour, photos load, founders | S-REF-04 | | FE-PUB-01…03 | |
| **Application forms** (mentor, mentee): fields match the server checks, browser limits within server limits, errors, "Other", spam trap, 18+ and consent, sending, every server answer, missing settings | S-FORM-01…05 | U-APP-01…11 | FE-FORM-01…10 | INT-01, LIVE-01, 02 |
| **Saving applications** (`beyond-apply`): validation, website-only (CORS), Turnstile, spam trap, 5/h per connection, 3/day per email, duplicate, email failure, test-inbox rule, caps | | F-APPLY-01…14, U-TS-01…02 | | INT-01, SMK-API-04 |
| **Emails**: contents, escaping, links, sender, reply-to, caps | | U-TPL-01…07, U-MAIL-01…07 | | INT-01, 04, 08, 09 |
| **Admin portal access**: admins only (browser, database and function) | | F-ADM-AUTH-01…05 | FE-ADM-01, FE-NAV-02 | INT-02, 03, 07, SMK-API-02 |
| **Applications in the portal**: counts, filters, search, detail with every answer, email state, deep link from the email, safe display of typed text | S-FORM-04 | | FE-ADM-02…05 | INT-03, LIVE-03 |
| **Accept / reject / resend / delete** | | F-ADM-APP-01…11 | FE-ADM-06…10 | INT-04, 09, LIVE-03 |
| **Members tab**: states, role, suspend, reactivate, remove (account kept), can't lock yourself out | | F-ADM-MEM-01…05 | FE-ADM-11, 12 | INT-10 |
| **Activity log and CSV export** (Excel-friendly, formulas neutralised) | | | FE-ADM-13, 14 | INT-11 |
| **Join link** (`beyond-join`): check, claim, expiry, reuse, password rules, existing account (password untouched), rate limit | S-REF-05 | F-JOIN-01…09 | FE-JOIN-01…05 | INT-05, LIVE-04 |
| **Card pre-filled from the application** (database trigger) | S-FORM-05 | F-ADM-APP-04, F-JOIN-04 | FE-CARD-01 | INT-05 |
| **Login**: correct, wrong, too many, empty, back to the page you came from, already logged in, expired link | | | FE-LOGIN-01…07 | LIVE-03, 06 |
| **Forgot password** (`beyond-password-reset`): same answer for everyone, members only, limits, link back to the site, new password | | F-RESET-01…07 | FE-LOGIN-05, FE-RESET-01…03 | INT-08, LIVE-05 |
| **Log out** (only on My profile): one navigation, nothing left in the browser | | | FE-NAV-03 | LIVE-05 |
| **Suspended members** | | F-RESET-04 | FE-NAV-04 | INT-10 |
| **My profile**: filled in from the application, required fields, Studies, save, first save right after joining, rate limits explained, hidden card | S-SQL-06, S-REF-05 | | FE-CARD-01…06 | INT-06, 07, LIVE-03, 04 |
| **Photos**: cropped to a 3:4 portrait, 450×600 JPEG, own folder only, old photo removed, remove photo, private bucket | | | FE-CARD-04, 05, FE-DIR-01 | INT-06, LIVE-04, SMK-API-03 |
| **Directory**: finished and visible cards only, photo or grey portrait, filters, search, admin button, kept for 10 minutes, refresh limit, load errors, first visit goes to My profile | | | FE-DIR-01…06 | INT-07, LIVE-04 |
| **Database rules**: everything `beyond_`, nothing project-wide, RLS on every table, locked-down functions, visitors get nothing | S-SQL-01…05 | | | INT-02, SMK-API-02 |
| **Publishing**: build output, settings file, no private files, security headers, `www` redirect, public key only | S-SYN-03, S-BLD-01…02 | | | SMK-SITE-02…04 |
| **Edge Function settings**: each function checks the caller itself (the new Supabase keys need `verify_jwt = false`) | S-SYN-04 | | | SMK-API-04…05 |
| **Secrets**: none in any file that could be pushed; `.env` and `js/config.js` ignored | S-SEC-01…02, S-SYN-05 | | | SMK-SITE-04 |
| **The test gate itself** | S-GATE-01…02 | | | |
| **Keep-awake ping** | | | | SMK-API-01 (and the "Keep Supabase awake" workflow) |

## 4. When to run what

| Situation | Do this |
|---|---|
| Any change, before pushing to `main` | Nothing: `git push` runs `npm test`. A failing test blocks the push. |
| Changed SQL in `supabase/*.sql` | Run the SQL in the Supabase SQL Editor, then `npm run test:integration` |
| Changed `supabase/functions/` | `npx supabase functions deploy beyond-apply beyond-admin beyond-join beyond-password-reset --project-ref <ref>`, then `npm run test:integration` |
| Just published (Vercel) | `npm run test:smoke` (GitHub also runs it every morning) |
| Changed a form question | Change it in the form, `supabase/functions/_shared/application.ts` and `QUESTIONS` in `js/admin.js`; the static tests tell you if one is missing |
| A test fails | Read its name: it says what should happen. Fix the site, or, if the change was intended, update the test in the same commit. |

`git push --no-verify` skips the hook. Only use it if you know why, because GitHub will still run the same tests and show a red ✗.

## 5. Not automated (check by hand when relevant)

- **Real email delivery and look** in Gmail, Outlook and Apple Mail. Send yourself one real application at most once in a while, not repeatedly.
- **The real Turnstile widget** (once its keys are set): solve it once on the live form.
- **Safari and Firefox**: the browser tests use Chromium-based browsers (Edge, Chrome).
- **Visual design**: the tests check layout problems (overflow, hidden elements), not whether something looks right.
- **Screen readers**: labels, focus and the skip link are tested; a real screen-reader pass is not.
- **Supabase dashboard settings** (Redirect URLs, Email provider): INT-08 detects a missing Redirect URL; the rest isn't checked.

## 6. How the tests work (for changing them)

```
tests/
  TESTPLAN.md              this file
  static/                  reads the files, runs nothing
  unit/                    Edge Functions in Node (helpers/edge.mjs = fake Deno, database, Resend, Turnstile)
  frontend/                real browser + local server (helpers/server.mjs) + fake Supabase (helpers/mock-supabase.mjs)
  smoke/                   live, read-only
  integration/             live, test inbox only, limited, cleans up
  helpers/                 the shared pieces above, plus browser.mjs, repo.mjs, live.mjs
```

- **Test runner:** Node's built-in runner (`node --test`), so no extra framework. Edge Functions are TypeScript; Node runs them with `--experimental-strip-types`, and `_shared/db.ts` is swapped for the in-memory database with `--experimental-test-module-mocks` (Node 22.6 or newer).
- **Browser:** `playwright-core` drives an installed browser, with no download. Choose one with `BROWSER_CHANNEL=msedge|chrome|chromium`.
- **Supabase library offline:** the browser tests serve the pinned Supabase library from `node_modules` instead of the CDN. S-SYN-05 checks it's the same file as in the pages (integrity hash).
- **Fake backend:** each browser test lists the answers the backend gives (`"POST /functions/v1/beyond-apply": { status: 409, json: { error: "duplicate" } }`), then checks what the page did and what it sent (`api.last("POST", "/functions/v1/beyond-apply").body`).
- **New feature:** add at least a unit test for any server logic, a browser test for any page behaviour, and a line in the table in section 3.
- **Debugging:** `DEBUG=1 npm run test:unit` shows the functions' own log lines; run a single test with `node --test --test-name-pattern="FE-CARD-04" tests/frontend/members.test.mjs`.
