# Beyond

Website of **Beyond, the Italian-Chinese Mentorship Community**.
It's plain HTML, CSS and a little JavaScript. There's nothing to install and no build step.

## Folder structure

```
index.html        Home
about.html        Our story, founders, other projects
mentor.html       Become a mentor (form)
mentee.html       Become a mentee (form)
login.html        Login (the "Login" link in the menu); after logging in you land on your profile
members.html      Members directory: every mentor and mentee card (members only)
my-card.html      My profile: your own card in the directory (members only)
join.html         The "Join Beyond" link from the acceptance email: choose a password
reset-password.html  Choose a new password (from the "forgot password" email, or My profile)
admin.html        Admin portal: applications, members, activity (admins only)
css/styles.css    All styling. Colors and fonts are at the top.
js/content.js     ← ALL EDITABLE CONTENT: mentors, founders, projects, email, socials, interface texts
js/main.js        Builds the header/footer and cards, sends the application forms (normally no need to edit)
js/members.js     The members area: login, directory, My profile, join, new password (normally no need to edit)
js/admin.js       The admin portal (normally no need to edit)
supabase/schema.sql             Database setup for the members area (run once in Supabase)
supabase/002-applications.sql   Database setup for applications and the admin portal (run once, after schema.sql)
supabase/functions/             Edge Functions: save applications, send the emails, join links, admin actions
supabase/functions/_shared/templates.ts  ← the text of every email Beyond sends
js/config.example.js  Template for js/config.js (Supabase address and key; the real file is never uploaded)
vercel.json, scripts/build.mjs  Publishing on Vercel (writes js/config.js from Vercel's settings)
tests/                The automatic tests, run before every push to main (see tests/TESTPLAN.md)
package.json, .githooks/  Test tools and the pre-push check (npm install once)
.github/workflows/    Keeping the free Supabase project awake
js/hero-particles.js  The Home hero animation: dots that morph between field symbols (timing, colours and dot counts in SETTINGS at the top)
assets/img/       Images (placeholder portrait, favicon). Put your photos here.
```

## Run it locally

- **Simplest:** double-click `index.html`. It opens in your browser.
- **Closer to the real site:** from this folder, run `python -m http.server 8000` and open <http://localhost:8000>.
  You can also use the "Live Server" extension in VS Code (right-click `index.html` → *Open with Live Server*).

## Edit the content

Almost everything you'll want to change is in **`js/content.js`**, inside the blocks marked `EDIT HERE`:

| What | Where in `content.js` |
|---|---|
| Mentor cards in the sliding row on Home (photo, Studied / Experience / Now) | `mentors` |
| The Team on About (photo, role, name, position, company, city, country, LinkedIn) | `founders` |
| Lead the Future / FullyFunded / Thesis Away links | `projects` |
| Contact email, social links | `contact`, `social` |
| Spam check on the application forms (Turnstile site key) | `applications` |
| Members area: max lines of Studies / Experience (the Supabase key is in `js/config.js`, see below) | `members` |
| Menu labels, form messages | `strings.en` |

Only change the text between quotes, and keep the commas. Save, then refresh the browser.

**Mentor photos:** put them in `assets/img/mentors/` (landscape, around 800 × 600 px) and set `photo: "assets/img/mentors/name.jpg"`. You can add as many mentors as you like; the row keeps looping.

**Team photos (About):** crop square (around 800 × 800 px), compress at <https://squoosh.app>, name it in lowercase with hyphens (e.g. `federico-zhou.jpg`), put it in `assets/img/founders/` and set `photo: "assets/img/founders/federico-zhou.jpg"`. Leave `photo: ""` to show the grey placeholder. Add `photoPosition: "50% 10%"` to keep the top of the photo when it is cropped.

**Email texts:** the emails Beyond sends (confirmation, new application, welcome, rejection, new password) are in `supabase/functions/_shared/templates.ts`. After changing them, publish the functions again (see step 5 below).

**Story text:** the long story is written directly in `about.html`, and the short version is in `index.html`. Look for the comments `EDIT: STORY TEXT`. The intro texts and thank-you messages on `mentor.html` and `mentee.html` are marked the same way (`EDIT: INTRO TEXT`, `EDIT: THANK-YOU MESSAGE`).

**Colors and fonts:** change the variables at the top of `css/styles.css` (section 1, "Design tokens").

## Applications, members area and admin portal (Supabase, free plan)

How it works, end to end:

1. Someone fills in **Become a mentor** or **Become a mentee**. The application is saved in Supabase, **you** get an email with every answer (replying to it writes to the applicant), and **they** get a confirmation with a copy of what they sent.
2. You open **`admin.html`** (only admins can use it) and click **Accept** or **Reject**. Accepting emails them a **Join Beyond** link (valid 14 days).
3. On the join page they choose a **password**, then land on **My profile**, already filled in from their application. They can add a photo (without one, the directory shows a grey portrait) and save.
4. As soon as they save their card, they appear in the **members directory**. Only members can see it. Later they log in with email and password (the **Login** link in the menu, which takes them to their profile; when logged in, the menu shows **Directory** and **My profile**); "Forgot your password?" emails them a link to choose a new one.

The forms, the members pages and the admin portal need the Supabase settings (`js/config.js`, see below). Without them the forms show an error and the members pages say they can't load.

**Shared Supabase project.** Beyond uses a Supabase project that another app also uses. So everything Beyond creates starts with `beyond_` (tables, functions, the photo bucket `beyond-avatars`, the Edge Functions `beyond-…`, the secrets `BEYOND_…`), and the setup below changes **nothing project-wide** (sign-ups, Site URL, SMTP, email templates). Beyond sends its own emails, as `info@beyondicmc.com`, through Resend. People who use the other app get no access to Beyond unless you accept them.

### Where the keys go (and why none of them are on GitHub)

The pages run in the visitor's browser, so the browser needs the project address and the **anon public** key to talk to Supabase. That key is designed to be public (it's also inside your other app's JavaScript); the database rules in `supabase/*.sql` and the checks in the Edge Functions are what protect the data. Even so, it is kept out of the repository:

- **On your computer:** copy `js/config.example.js` to `js/config.js` and fill in the two values (the same as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in your `.env`). `js/config.js` and `.env` are in `.gitignore`, so they never go to GitHub.
- **On the live site:** Vercel runs `scripts/build.mjs` while publishing, which writes `js/config.js` from two Vercel **environment variables**.
- **The secret keys** (Resend API key, Turnstile secret) are stored **in Supabase** as Edge Function secrets, never in the website or in GitHub.

**Never** use the `service_role` key or the database password anywhere in this website. (The Edge Functions get the service_role key from Supabase automatically; you never copy it.)

### Set it up (once)

**1. Email: `info@beyondicmc.com`.** Three free services, each with one job:
- **Cloudflare Email Routing** *receives* mail for `info@beyondicmc.com` and forwards it to Beyond's Gmail (see "Publish the website", step 5).
- **Resend** *sends* every automatic email (confirmation, new application, welcome, rejection, new password) as **Beyond `<info@beyondicmc.com>`**. Create a free account at <https://resend.com> → *Domains → Add domain* → `beyondicmc.com`, and add the DNS records it shows in Cloudflare (*DNS → Records*, each one **DNS only**). When Resend shows the domain as *Verified*, create an *API key* (permission "Sending access") and keep it for step 5. Free plan: 3,000 emails a month, 100 a day; each application uses 2.
- **Gmail** is just where you read and write. To write *from* `info@` too: Gmail → *Impostazioni → Account e importazione → Invia messaggi come → Aggiungi un altro indirizzo email*: name `Beyond`, address `info@beyondicmc.com`, untick "Considera come alias"; SMTP server `smtp.resend.com`, port `465`, username `resend`, password = a Resend API key, SSL. Gmail emails a code to `info@` (it arrives in the same Gmail): confirm it. Then choose `info@beyondicmc.com` in the "From" field when you write.

**2. The spam check (Cloudflare Turnstile, free).** Every application sends an email to the address typed in the form, so the forms need a check that a person (not a bot) is sending them. At <https://dash.cloudflare.com> → *Turnstile → Add widget*: any name, hostnames `beyondicmc.com` and `localhost`, mode *Managed*. You get a **site key** (public) and a **secret key**. Put the site key in `js/content.js`:
```js
applications: {
  turnstileSiteKey: "0x4AAAAAAA..."
},
```
The secret key goes in step 5.

**3. Create Beyond's tables.** In the Supabase project: *SQL Editor → New query*, paste all of `supabase/schema.sql`, click *Run* (skip this if you already did it before). Then a new query with all of `supabase/002-applications.sql`, and *Run*. They only create `beyond_…` things; if one reports an error, nothing else in the project is affected. `002-applications.sql` can safely be run again.

**4. Allow Beyond's pages in sign-in links.** *Authentication → URL Configuration → Redirect URLs*: **add** (don't replace anything) `https://beyondicmc.com/**`, `https://www.beyondicmc.com/**` and, for testing on your computer, `http://localhost:8000/**`. Leave the **Site URL** as it is: it belongs to the other app. Also check (without changing anything) that *Authentication → Sign In / Providers → Email* is enabled: members sign in with email and password.

**5. Publish the Edge Functions.** They are in `supabase/functions/` and need [Node.js](https://nodejs.org) on your computer. In a terminal, from this folder:
```
npx supabase login
npx supabase secrets set --project-ref <ref> BEYOND_RESEND_API_KEY=<resend api key> BEYOND_ADMIN_EMAIL=info@beyondicmc.com BEYOND_SITE_URL=https://beyondicmc.com BEYOND_ALLOWED_ORIGINS=https://beyondicmc.com,https://www.beyondicmc.com,http://localhost:8000 BEYOND_TURNSTILE_SECRET=<turnstile secret key> BEYOND_IP_SALT=<any long random text>
npx supabase functions deploy beyond-apply beyond-admin beyond-join beyond-password-reset --project-ref <ref>
```
`<ref>` is the project id: the `abcdefgh` in `https://abcdefgh.supabase.co`. Only these four functions and the `BEYOND_` secrets are added; the other app's functions and secrets are not touched. Run the `deploy` line again whenever you change a file in `supabase/functions/` (for example the email texts in `_shared/templates.ts`).

| Secret | What it is |
|---|---|
| `BEYOND_RESEND_API_KEY` | The Resend API key (step 1) |
| `BEYOND_ADMIN_EMAIL` | Where new applications are sent: `info@beyondicmc.com` (it reaches the Gmail), or any address of yours |
| `BEYOND_SITE_URL` | The site's address, no `/` at the end. Used in the links in the emails |
| `BEYOND_ALLOWED_ORIGINS` | Sites allowed to call the functions: the site's domain only (no path), and `http://localhost:8000` for testing |
| `BEYOND_TURNSTILE_SECRET` | Turnstile secret key (step 2). Without it the spam check is skipped: only for testing |
| `BEYOND_IP_SALT` | Any long random text. Visitors' IP addresses are only stored scrambled with it |
| `BEYOND_MAIL_FROM` | Optional: the sender (default `Beyond <info@beyondicmc.com>`; the address must be on the domain verified in Resend) |

**6. Publish the website on Vercel.** See "Publish the website (Vercel + beyondicmc.com)" below.

**7. Repository secrets (for the keep-awake job).** In GitHub: *Settings → Secrets and variables → Actions → New repository secret*: `SUPABASE_URL` and `SUPABASE_ANON_KEY` (the anon public key).

**8. Keep it awake.** Free projects pause after about a week without activity. `.github/workflows/supabase-keepalive.yml` pings the project every 3 days using those secrets. Test it once: *Actions → Keep Supabase awake → Run workflow*.

**9. Make yourself admin.** *SQL Editor → New query*:
```sql
insert into public.beyond_invites (email, role) values ('<your email in lower case>', 'admin');
```
- If your email **already has an account** in this project (e.g. from the other app), you now have a Beyond card: log in on `login.html` with that account's password (or use "Forgot your password?").
- If it **doesn't**: *Authentication → Users → Add user → Create new user*, your email, a password of your choice, tick **Auto Confirm User**. Then log in on `login.html` with it.

The first time, you fill in your own card. After that, an **Admin** link appears in the directory's toolbar. To make another person admin later, change their role in the admin portal's **Members** tab.

**10. Try it on your computer** (optional): create `js/config.js` as explained above, run `python -m http.server 8000`, and open <http://localhost:8000/mentee.html>.

### Every day: the admin portal (`admin.html`)

- **Applications:** pending ones first. Click one to see every answer, whether the emails went out, and its history. The link in the "New application" email opens it directly.
  - **Accept** (optionally with a personal note, included in the email) → they get the join link.
  - **Reject** → by default they get a polite email (untick the box to send nothing). The note is included.
  - **Resend join link** if it expired or got lost. **Delete application** for spam or duplicates.
- **Members:** everyone accepted, with their state: *Invited* (link sent), *Joined, card not saved*, *Active*, *Suspended*. Change a role (mentor, mentee, admin), **Suspend** (they disappear from the directory and can't see it) or **Reactivate**, and **Remove** (deletes their card, photos and invite; their account stays, because the other app may use it).
- **Activity:** the last 100 things admins did.
- **Export CSV** (Applications and Members): this is also your **monthly backup**, because the free plan has no backups. Keep the files somewhere private, **never** in this repository.

If you change a question in a form (`mentor.html` / `mentee.html`), change it in `supabase/functions/_shared/application.ts` too (then deploy the functions again), and its label in `QUESTIONS` in `js/admin.js`.

### Free plan limits, and what the site does about them

These limits are for the **whole project**, so they are shared with the other app.

| Limit (check supabase.com/pricing, they can change) | How the site stays within it |
|---|---|
| Pauses after ~7 days without activity | The GitHub job pings it every 3 days |
| 500 MB database | A card is ~2 KB and an application ~5 KB: tens of thousands of each |
| 1 GB file storage | Photos are cropped and shrunk to 400 × 400 px (~40 KB) in the browser before upload; max 3 files per member |
| ~5 GB data transfer a month | The directory is one request, kept in the browser for 10 minutes; photos load only when scrolled into view, and their links (7 days) are reused so browsers keep them cached. Roughly 1,500 full directory views a month with 100 members |
| 500,000 Edge Function calls a month | One call per application, per admin action, per join and per "forgot password" |
| Email sending | Resend free plan: 3,000 a month, 100 a day (shared with emails you write from `info@` in Gmail). The site itself never sends more than 30 an hour, 90 a day, and 5 a day to the same address (`supabase/functions/_shared/mail.ts`), so neither bots nor tests can get the domain flagged as spam. Applications: 5 an hour per connection, 3 a day per email. "Forgot password": 3 an hour per email |
| No image resizing on the server | Done in the browser instead |
| No backups | Monthly CSV export from the admin portal |

The database also limits each member to one card save every 3 seconds and 30 an hour, and checks every field's length and the 3-line maximum for Studies and Experience.

## Testing

Everything is covered by automatic tests: see **[tests/TESTPLAN.md](tests/TESTPLAN.md)**.

- **Once:** install [Node.js](https://nodejs.org) 22 or newer, then run `npm install` in this folder. This also turns on the check that runs before every push.
- **Every push to `main`** runs `npm test` (about a minute: no internet, no emails, no live data) and is refused if a test fails. GitHub runs the same tests (*Actions → Tests*).
- **After publishing:** `npm run test:smoke` checks the live site (read-only).
- **After changing `supabase/`** (and deploying it): `npm run test:integration` runs the whole journey on the live backend. It only uses Resend's never-delivered test addresses, at most once an hour and 4 times a day, and removes everything it created.

## Publish the website (Vercel + beyondicmc.com)

The site lives at **https://beyondicmc.com**, hosted for free on Vercel. The domain is registered at Cloudflare, which also runs its DNS. Every push to `main` on GitHub publishes the site automatically.

**Set up (once)**
1. **Vercel:** sign in at <https://vercel.com> with GitHub → *Add New → Project* → import this repository. The settings come from `vercel.json` (build: `node scripts/build.mjs`, output: `dist`), so leave them as they are.
2. **Environment variables:** in the import screen (or later in *Project → Settings → Environment Variables*) add `SUPABASE_URL` and `SUPABASE_ANON_KEY` (the anon public key, never the service_role key). Then *Deploy*. The site is live at a `*.vercel.app` address.
3. **The domain:** *Project → Settings → Domains* → add `beyondicmc.com`, and also `www.beyondicmc.com` (Vercel offers to redirect `www` to the main address: accept). Vercel shows the DNS records it needs.
4. **DNS at Cloudflare:** *Cloudflare dashboard → beyondicmc.com → DNS → Records → Add record*, and create exactly the records Vercel shows (usually an `A` record for `@` and a `CNAME` for `www`). Set each one to **DNS only** (grey cloud, not orange). Within minutes to an hour, Vercel shows the domain as valid and turns on HTTPS by itself.
5. **The contact address (optional):** *Cloudflare → beyondicmc.com → Email → Email Routing* → turn it on and create `info@beyondicmc.com` forwarding to Beyond's Gmail. Cloudflare adds the email DNS records itself. This only receives email; sending goes through Resend (step 1 of the Supabase setup above).

**Changing the address later:** if the domain ever changes, update it in four places: the Vercel domain, the Supabase *Redirect URLs*, the `BEYOND_SITE_URL` and `BEYOND_ALLOWED_ORIGINS` secrets (step 5 above), and the Turnstile hostnames.

**Building on your computer** (optional): `node scripts/build.mjs` makes the same `dist/` folder Vercel publishes (`dist/` is never uploaded to GitHub).

## Adding an Italian version later

1. Create a folder `it/` and copy the `.html` files into it (`admin.html` can stay in English only).
2. In each copied file, change `<html lang="en">` to `<html lang="it">`, translate the text, and add `../` in front of the `css/`, `js/` and `assets/` paths (e.g. `href="../css/styles.css"`).
3. In `js/content.js`, copy the `strings.en` block, rename it `it` and translate it. Then add `{ code: "it", label: "IT" }` to `languages`. An EN / IT switch appears in the header automatically.
4. Any mentor, founder or project text can be translated by writing it as `{ en: "...", it: "..." }` instead of a plain `"..."`.
