# Beyond

Website of **Beyond, the Italian-Chinese Mentorship Community**.
It's plain HTML, CSS and a little JavaScript. There's nothing to install and no build step.

## Folder structure

```
index.html        Home
about.html        Our story, founders, other projects
mentor.html       Become a mentor (form)
mentee.html       Become a mentee (form)
css/styles.css    All styling. Colors and fonts are at the top.
js/content.js     ← ALL EDITABLE CONTENT: mentors, founders, projects, form links, email, socials
js/main.js        Builds the header/footer and cards, handles the forms (normally no need to edit)
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

## Deploy for free

**Netlify (easiest)**
1. Go to <https://app.netlify.com/drop>.
2. Drag this whole folder onto the page. Your site is live at a `*.netlify.app` address.
3. To update it, drag the folder again (or connect the GitHub repository for automatic updates).

**GitHub Pages**
1. Push this folder to a GitHub repository.
2. Go to *Settings → Pages → Build and deployment*, choose *Deploy from a branch*, then pick `main` and `/ (root)`.
3. After a minute the site is live at `https://<your-username>.github.io/<repository-name>/`.

**Custom domain:** both services let you add your own domain (e.g. `beyond-community.org`) for free under their domain settings. You only pay for the domain itself.

## Adding an Italian version later

1. Create a folder `it/` and copy the four `.html` files into it.
2. In each copied file, change `<html lang="en">` to `<html lang="it">`, translate the text, and add `../` in front of the `css/`, `js/` and `assets/` paths (e.g. `href="../css/styles.css"`).
3. In `js/content.js`, copy the `strings.en` block, rename it `it` and translate it. Then add `{ code: "it", label: "IT" }` to `languages`. An EN / IT switch appears in the header automatically.
4. Any mentor, founder or project text can be translated by writing it as `{ en: "...", it: "..." }` instead of a plain `"..."`.
