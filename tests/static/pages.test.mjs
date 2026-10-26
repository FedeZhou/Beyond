// Static checks: the HTML pages, and that pages, JavaScript, texts and the
// server-side validation all agree with each other.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { read, exists, PAGES, PRIVATE_PAGES, LINK_PAGES, content, ids, attr, tags, formBlock, serverQuestions } from "../helpers/repo.mjs";

const html = Object.fromEntries(PAGES.map((p) => [p, read(p)]));
const NAV_PAGES = ["index.html", "about.html", "mentor.html", "mentee.html", "login.html"];

describe("S-PG every page", () => {
  test("S-PG-01 the expected pages exist", () => {
    assert.deepEqual(PAGES, ["about.html", "admin.html", "index.html", "join.html", "login.html", "members.html", "mentee.html", "mentor.html", "my-card.html", "reset-password.html"]);
  });
  for (const p of PAGES) {
    test(`S-PG-02 ${p}: structure (lang, title, viewport, skip link, header, footer, data-page)`, () => {
      const h = html[p];
      assert.match(h, /^<!doctype html>\s*<html lang="en">/);
      assert.match(h, /<title>[^<]*\bBeyond\b[^<]*<\/title>/);
      assert.match(h, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
      assert.match(h, /<a class="skip-link" href="#main">/);
      assert.match(h, /<header id="site-header"/);
      assert.match(h, /<footer id="site-footer"/);
      assert.match(h, /<main id="main"/);
      assert.match(h, /<body data-page="[\w-]+">/);
    });
    test(`S-PG-03 ${p}: scripts load in the right order (content → config → main)`, () => {
      const order = [...html[p].matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
      assert.equal(order[0], "js/content.js");
      const iMain = order.indexOf("js/main.js");
      assert.ok(iMain > 0);
      if (order.includes("js/config.js")) assert.ok(order.indexOf("js/config.js") < iMain, "config.js before main.js (menu login state)");
      for (const s of ["js/members.js", "js/admin.js"]) if (order.includes(s)) {
        assert.ok(order.indexOf(s) > iMain, s + " after main.js");
        assert.ok(order.some((x) => /supabase-js@/.test(x)), s + " needs the Supabase library");
        assert.ok(order.includes("js/config.js"), s + " needs config.js");
      }
      for (const t of tags(html[p], "script")) assert.match(t, /\bdefer\b/, t);
    });
    test(`S-PG-04 ${p}: every local link and file exists`, () => {
      for (const m of html[p].matchAll(/\s(?:href|src)="([^"#:?]+)(?:[?#][^"]*)?"/g)) {
        if (m[1] === "js/config.js") continue;                         // written at publish time
        assert.ok(exists(m[1]), `${p} → ${m[1]}`);
      }
    });
    test(`S-PG-05 ${p}: ids are unique`, () => {
      const list = ids(html[p]);
      assert.deepEqual(list.filter((id, i) => list.indexOf(id) !== i), []);
    });
    test(`S-PG-06 ${p}: every form field has a label`, () => {
      const pageIds = new Set(ids(html[p]));
      for (const t of [...tags(html[p], "input"), ...tags(html[p], "select"), ...tags(html[p], "textarea")]) {
        if (/type="hidden"/.test(t) || /name="_gotcha"/.test(t)) continue;
        const id = attr(t, "id");
        const labelled = attr(t, "aria-label") || (id && new RegExp(`<label[^>]*for="${id}"`).test(html[p]));
        assert.ok(labelled, `${p}: ${t}`);
        if (id) assert.ok(pageIds.has(id));
      }
    });
    test(`S-PG-07 ${p}: the no-JavaScript menu matches the real menu`, () => {
      const links = [...(/<noscript>\s*<nav[\s\S]*?<\/nav>/.exec(html[p]) || [""])[0].matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
      assert.deepEqual(links, NAV_PAGES);
    });
  }
  test("S-PG-08 private pages are hidden from search engines; link pages never leak their address", () => {
    for (const p of PRIVATE_PAGES) assert.match(html[p], /<meta name="robots" content="noindex">/, p);
    for (const p of LINK_PAGES) assert.match(html[p], /<meta name="referrer" content="no-referrer">/, p);
  });
  test("S-PG-09 images have alt text", () => {
    for (const p of PAGES) for (const t of tags(html[p], "img")) assert.notEqual(attr(t, "alt"), null, `${p}: ${t}`);
  });
});

describe("S-REF JavaScript ↔ pages ↔ texts", () => {
  const js = { members: read("js/members.js"), admin: read("js/admin.js"), main: read("js/main.js") };
  const pageFor = { login: "login.html", members: "members.html", "my-card": "my-card.html", join: "join.html", reset: "reset-password.html" };
  test("S-REF-01 every element members.js looks up exists on its page", () => {
    // Each setupXxxPage() looks up ids with $("..."); check them against that page
    const sections = { login: /function setupLoginPage\(\)[\s\S]*?\n  }\n/, members: /function setupDirectoryPage\(\)[\s\S]*?\n  }\n/, "my-card": /function setupCardPage\(\)[\s\S]*?\n  }\n/, join: /function setupJoinPage\(\)[\s\S]*?\n  }\n/, reset: /function setupResetPage\(\)[\s\S]*?\n  }\n/ };
    for (const [page, re] of Object.entries(sections)) {
      const code = re.exec(js.members)[0];
      const pageIds = new Set(ids(html[pageFor[page]]));
      for (const m of code.matchAll(/\$\("([\w-]+)"\)/g)) assert.ok(pageIds.has(m[1]), `${pageFor[page]} is missing #${m[1]}`);
    }
    // Shared helpers used on every members page
    for (const p of Object.values(pageFor)) for (const id of ["members-loading", "members-notice"]) assert.ok(ids(html[p]).includes(id), `${p} #${id}`);
  });
  test("S-REF-02 every element admin.js looks up exists in admin.html", () => {
    const pageIds = new Set(ids(html["admin.html"]));
    for (const m of js.admin.matchAll(/\$\("([\w-]+)"\)/g)) {
      if (["decision-note", "reject-notify", "detail-status"].includes(m[1])) continue;   // drawn by admin.js itself
      assert.ok(pageIds.has(m[1]), "admin.html is missing #" + m[1]);
    }
    for (const sel of ["data-tab=\"applications\"", "data-tab=\"members\"", "data-tab=\"activity\"", "data-status=\"pending\"", "data-export=\"applications\"", "data-export=\"members\"", "data-refresh", "data-signout"]) {
      assert.ok(html["admin.html"].includes(sel), sel);
    }
  });
  test("S-REF-03 every interface text used by the code exists in content.js", () => {
    const strings = content().strings.en;
    for (const m of js.members.matchAll(/\bT\.(\w+)/g)) assert.ok(m[1] in strings.members, "strings.en.members." + m[1]);
    for (const m of js.main.matchAll(/\bT\.form\.(\w+)/g)) assert.ok(m[1] in strings.form, "strings.en.form." + m[1]);
    for (const m of js.main.matchAll(/T\.nav\[/g)) assert.ok(m);
    for (const k of ["home", "about", "mentor", "mentee", "members", "directory", "profile"]) assert.ok(strings.nav[k], "strings.en.nav." + k);
    assert.equal(strings.nav.members, "Login");
  });
  test("S-REF-06 there is no demo mode any more (the live site is the only mode)", () => {
    for (const f of ["js/main.js", "js/members.js", "js/admin.js", "js/content.js", "css/styles.css", ...PAGES]) {
      assert.doesNotMatch(read(f), /demo|DEMO|demoRows|demoApplications/i, f);
    }
  });
  test("S-REF-04 content.js has everything the site needs", () => {
    const c = content();
    assert.equal(c.contact.email, "info@beyondicmc.com");
    assert.equal(typeof c.applications.turnstileSiteKey, "string");
    assert.equal(c.forms, undefined, "Formspree links are gone");
    assert.ok(exists(c.placeholderPhoto) && exists(c.placeholderImage));
    for (const m of c.mentors) {
      assert.ok(m.role && m.location, "mentor card text");
      if (m.photo) assert.ok(exists(m.photo), m.photo);
    }
    for (const f of c.founders) {
      assert.ok(f.name, "team card name");
      assert.equal(typeof f.linkedin, "string", f.name);
      if (f.photo) assert.ok(exists(f.photo), f.photo);
    }
    for (const l of c.legal) assert.ok(l.id && l.label);
  });
  test("S-REF-05 the members area limits match the database", () => {
    const c = content().members;
    const sql = read("supabase/schema.sql");
    assert.match(sql, new RegExp("cardinality\\(studies\\) <= " + c.maxStudies));
    assert.match(sql, new RegExp("cardinality\\(experience\\) <= " + c.maxExperience));
    assert.match(js.members, /var SAVE_GAP = 3 \* 1000/);
    assert.match(read("supabase/002-applications.sql"), /interval '3 seconds'/);
    const minJoin = /MIN_PASSWORD = (\d+)/.exec(read("supabase/functions/beyond-join/index.ts"))[1];
    assert.match(js.members, new RegExp("MIN_PASSWORD = " + minJoin));
  });
});

describe("S-FORM application forms ↔ server validation ↔ admin portal", () => {
  const server = serverQuestions();
  for (const role of ["mentor", "mentee"]) {
    test(`S-FORM-01 ${role}.html sends exactly the questions the server checks`, () => {
      const form = formBlock(html[role + ".html"]);
      assert.match(form, new RegExp(`data-form="${role}"`));
      const names = [...form.matchAll(/\sname="([^"]+)"/g)].map((m) => m[1]).filter((n) => n !== "_gotcha");
      const expected = [...server.common, ...server[role], ...server.checks].map((q) => q.name);
      assert.deepEqual([...new Set(names)].sort(), expected.sort());
    });
    test(`S-FORM-02 ${role}.html: browser limits never exceed the server's`, () => {
      const form = formBlock(html[role + ".html"]);
      for (const q of [...server.common, ...server[role]]) {
        const tag = new RegExp(`<(?:input|textarea|select)[^>]*name="${q.name}"[^>]*>`).exec(form)[0];
        const max = attr(tag, "maxlength");
        if (!/^<select/.test(tag)) assert.ok(max && Number(max) <= q.max, `${role}.${q.name}: maxlength ${max} vs server ${q.max}`);
      }
    });
    test(`S-FORM-03 ${role}.html: spam trap, one consent box (18+, terms, privacy), captcha slot, thank-you panel`, () => {
      const h = html[role + ".html"];
      assert.match(h, /<div class="hp" aria-hidden="true">[\s\S]*?name="_gotcha"[^>]*tabindex="-1"/);
      assert.doesNotMatch(h, /age_confirmed/);
      assert.match(h, /I am 18 or older and I agree to the/);
      assert.match(h, /name="consent" type="checkbox"[^>]*required/);
      assert.match(h, /class="form-captcha"/);
      assert.match(h, new RegExp(`data-thanks="${role}-thanks"`));
      assert.match(h, new RegExp(`id="${role}-thanks"`));
    });
    test(`S-FORM-04 the admin portal has a label for every ${role} question`, () => {
      const block = new RegExp(role + ":\\s*\\[([\\s\\S]*?)\\n    \\]").exec(read("js/admin.js"))[1];
      const keys = [...block.matchAll(/\["(\w+)",/g)].map((m) => m[1]);
      assert.deepEqual(keys.sort(), server[role].map((q) => q.name).sort());
    });
  }
  test("S-FORM-05 the card pre-fill reads questions that exist", () => {
    const sql = read("supabase/002-applications.sql");
    const used = [...sql.matchAll(/answers->>'(\w+)'/g)].map((m) => m[1]);
    const all = [...server.mentor, ...server.mentee].map((q) => q.name);
    for (const u of used) assert.ok(all.includes(u), "pre-fill uses unknown answer " + u);
  });
});
