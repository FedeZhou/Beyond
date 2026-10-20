# Beyond

Website of **Beyond, the Italian-Chinese Mentorship Community**.
It's plain HTML, CSS and a little JavaScript. There's nothing to install and no build step.

## Folder structure

```
index.html        Home
about.html        Our story, founders, other projects
mentor.html       Become a mentor (form)
mentee.html       Become a mentee (form)
members.html      Members directory (sign-in, then every mentor and mentee card)
my-card.html      Members: edit your own card
css/styles.css    All styling. Colors and fonts are at the top.
js/content.js     ← ALL EDITABLE CONTENT: mentors, founders, projects, form links, email, socials
js/main.js        Builds the header/footer and cards, handles the forms (normally no need to edit)
js/members.js     The members area: sign-in, directory, My card (normally no need to edit)
supabase/schema.sql   Database setup for the members area (run once in Supabase)
js/config.example.js  Template for js/config.js (Supabase address and key; the real file is never uploaded)
.github/workflows/    Publishing the site, and keeping the free Supabase project awake
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
| Founder and Co-founder (name, role, photo, bio, LinkedIn) | `founders` |
| Lead the Future / FullyFunded / Thesis Away links | `projects` |
| Contact email, social links | `contact`, `social` |
| Where forms are sent | `forms` |
| Members area: max lines of Studies / Experience (the Supabase key is in `js/config.js`, see below) | `members` |
| Menu labels, form messages | `strings.en` |

Only change the text between quotes, and keep the commas. Save, then refresh the browser.

**Mentor photos:** put them in `assets/img/mentors/` (landscape, around 800 × 600 px) and set `photo: "assets/img/mentors/name.jpg"`. You can add as many mentors as you like; the row keeps looping.

**Founder photos:** put the image in `assets/img/` (e.g. `founder.jpg`, portrait format around 800 × 1000 px) and set `photo: "assets/img/founder.jpg"`. Leave `photo: ""` to show the grey placeholder.

**Story text:** the long story is written directly in `about.html`, and the short version is in `index.html`. Look for the comments `EDIT: STORY TEXT`. The intro texts and thank-you messages on `mentor.html` and `mentee.html` are marked the same way (`EDIT: INTRO TEXT`, `EDIT: THANK-YOU MESSAGE`).

**Colors and fonts:** change the variables at the top of `css/styles.css` (section 1, "Design tokens").

## Connect the forms (Formspree, free)

1. Create a free account at <https://formspree.io>.
2. Create two forms, "Beyond mentors" and "Beyond mentees". Each one gives you a link like `https://formspree.io/f/abcdwxyz`.
3. Paste them into `js/content.js`:
   ```js
   forms: {
     mentor: "https://formspree.io/f/abcdwxyz",
     mentee: "https://formspree.io/f/efghijkl"
   },
   ```
4. Send a test application from the live site. Formspree asks you to confirm the first submission by email.

Until you paste real links, the forms run in **demo mode**. A small note says so, and submitting shows the thank-you message without sending anything.

**Alternatives:** Tally and Google Forms don't accept submissions from a custom HTML form. To use them, replace the `<form>…</form>` block in `mentor.html` / `mentee.html` with their embed code (or with a button linking to the form).

## Members area (Supabase, free plan)

Approved mentors and mentees sign in with a one-time link sent to their email (no passwords) and see everyone's card. Only people you add to Beyond's invite list get in. Until it's connected, `members.html` shows sample cards in **demo mode**.

**Shared Supabase project.** Beyond uses a Supabase project that another app also uses. So everything Beyond creates starts with `beyond_` (photos go in their own bucket, `beyond-avatars`), and the setup below changes **nothing project-wide** (sign-ups, Site URL, email settings). People who use the other app get no access to Beyond unless you invite them.

### Where the keys go (and why none of them are on GitHub)

The members pages run in the visitor's browser, so the browser needs the project address and the **anon public** key to talk to Supabase. That key is designed to be public (it's also inside your other app's JavaScript); the database rules in `supabase/schema.sql` are what protect the data. Even so, it is kept out of the repository:

- **On your computer:** copy `js/config.example.js` to `js/config.js` and fill in the two values (the same as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in your `.env`). `js/config.js` and `.env` are in `.gitignore`, so they never go to GitHub.
- **On the live site:** the "Deploy site" workflow (`.github/workflows/deploy-site.yml`) writes `js/config.js` while publishing, from two **repository secrets**.

**Never** use the `service_role` key or the database password anywhere in this website.

### Set it up (once)

1. **Create Beyond's tables.** In the Supabase project: *SQL Editor → New query*, paste all of `supabase/schema.sql`, click *Run*. It only creates new `beyond_…` things; if it reports an error, nothing else in the project is affected.
2. **Allow the members page in sign-in links.** *Authentication → URL Configuration → Redirect URLs*: **add** (don't replace anything) `https://<user>.github.io/<repo>/**` and, for testing on your computer, `http://localhost:8000/**`. Leave the **Site URL** as it is: it belongs to the other app.
3. **Leave the project-wide settings alone.** Don't change "Allow new users to sign up", the Site URL, SMTP or the email templates: the other app uses them too. Beyond's sign-in emails use whatever email sender and "Magic Link" template the project already has. (If the project still uses Supabase's built-in email, it only sends a few emails per hour; setting up Gmail under *Authentication → Emails → SMTP Settings* would improve it for both apps.)
4. **Repository secrets.** In GitHub: *Settings → Secrets and variables → Actions → New repository secret*: `SUPABASE_URL` and `SUPABASE_ANON_KEY` (the anon public key). They're used by both workflows below.
5. **Publish with GitHub Actions.** *Settings → Pages → Build and deployment → Source: **GitHub Actions***. Every push to `main` now publishes the site through `deploy-site.yml`.
6. **Keep it awake.** Free projects pause after about a week without activity. `.github/workflows/supabase-keepalive.yml` pings the project every 3 days using the same secrets. Test it once: *Actions → Keep Supabase awake → Run workflow*.
7. **Try it on your computer** (optional): create `js/config.js` as explained above, run `python -m http.server 8000`, and open <http://localhost:8000/members.html>.

### Add a new member (each time you approve an application)

1. *Table Editor → beyond_invites → Insert row*: their email **in lower case**, and role `mentor` or `mentee`.
2. If they **don't already have an account** in this Supabase project: *Authentication → Users → Add user → Create new user*, enter the same email, any long random password (they will never use it), and tick **Auto Confirm User**. No email is sent. If they already have an account (for example from the other app), skip this step: their Beyond card is created as soon as you invite them.
3. Tell them to open the Members page and ask for a sign-in link with that email. They fill in their card, then see the directory.

**To remove someone from Beyond:** delete their row in `beyond_profiles` and in `beyond_invites`. **Don't delete the user** in *Authentication → Users*: that account may also be used by the other app. To hide someone temporarily, set their `status` to `suspended` in `beyond_profiles`.

### Back up (once a month)

The free plan has no backups. *Table Editor → beyond_profiles → Export → CSV* (and the same for `beyond_invites`). Keep the files somewhere private, **never** in this repository.

### Free plan limits, and what the site does about them

These limits are for the **whole project**, so they are shared with the other app.

| Limit (check supabase.com/pricing, they can change) | How the site stays within it |
|---|---|
| Pauses after ~7 days without activity | The GitHub job pings it every 3 days |
| 500 MB database | A card is ~2 KB, so over 100,000 cards |
| 1 GB file storage | Photos are cropped and shrunk to 400 × 400 px (~40 KB) in the browser before upload; max 3 files per member |
| ~5 GB data transfer a month | The directory is one request, kept in the browser for 10 minutes; photos load only when scrolled into view, and their links (7 days) are reused so browsers keep them cached. Roughly 1,500 full directory views a month with 100 members |
| Email sending | One sign-in link per minute per browser; Supabase's own hourly limits apply too |
| No image resizing on the server | Done in the browser instead |
| No backups | Monthly CSV export |

The database also limits each member to one card save every 3 seconds and 30 an hour, and checks every field's length and the 3-line maximum for Studies and Experience.

## Deploy for free

**Netlify (easiest)**
1. Go to <https://app.netlify.com/drop>.
2. Drag this whole folder onto the page. Your site is live at a `*.netlify.app` address.
3. To update it, drag the folder again (or connect the GitHub repository for automatic updates).

**GitHub Pages**
1. Push this folder to a GitHub repository.
2. Go to *Settings → Pages → Build and deployment* and set **Source** to **GitHub Actions**. The `Deploy site` workflow publishes the site on every push to `main` (and writes the members area settings from the repository secrets, see above).
3. After a minute the site is live at `https://<your-username>.github.io/<repository-name>/`.

**Custom domain:** both services let you add your own domain (e.g. `beyond-community.org`) for free under their domain settings. You only pay for the domain itself.

## Adding an Italian version later

1. Create a folder `it/` and copy the four `.html` files into it.
2. In each copied file, change `<html lang="en">` to `<html lang="it">`, translate the text, and add `../` in front of the `css/`, `js/` and `assets/` paths (e.g. `href="../css/styles.css"`).
3. In `js/content.js`, copy the `strings.en` block, rename it `it` and translate it. Then add `{ code: "it", label: "IT" }` to `languages`. An EN / IT switch appears in the header automatically.
4. Any mentor, founder or project text can be translated by writing it as `{ en: "...", it: "..." }` instead of a plain `"..."`.
