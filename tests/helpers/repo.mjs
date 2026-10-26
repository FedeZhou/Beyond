// Reading the repository for the static checks.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import vm from "node:vm";
import { ROOT } from "./server.mjs";

export { ROOT };
export const read = (p) => readFileSync(join(ROOT, p), "utf8");
export const exists = (p) => existsSync(join(ROOT, p));
export const PAGES = readdirSync(ROOT).filter((f) => f.endsWith(".html")).sort();
// Pages for members and admins only, plus pages whose address holds a private link
export const PRIVATE_PAGES = ["admin.html", "join.html", "login.html", "members.html", "my-card.html", "reset-password.html"];
export const LINK_PAGES = ["admin.html", "join.html", "reset-password.html"];

// Files git tracks or would add (everything not ignored): what could be pushed
export function trackedFiles() {
  return execSync("git ls-files --cached --others --exclude-standard", { cwd: ROOT }).toString().split("\n").filter(Boolean);
}

// js/content.js, evaluated the way the browser does
export function content() {
  const sandbox = { window: {} };
  vm.runInNewContext(read("js/content.js"), sandbox);
  return sandbox.window.BEYOND;
}

export const ids = (html) => [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
export const attr = (tag, name) => { const m = new RegExp("\\s" + name + "=\"([^\"]*)\"").exec(tag); return m ? m[1] : null; };
export const tags = (html, name) => [...html.matchAll(new RegExp("<" + name + "\\b[^>]*>", "g"))].map((m) => m[0]);
// <form data-form="..."> ... </form>
export function formBlock(html) {
  const m = /<form class="form" data-form="[^"]+"[\s\S]*?<\/form>/.exec(html);
  return m ? m[0] : "";
}

// The questions of each form, from supabase/functions/_shared/application.ts
export function serverQuestions() {
  const src = read("supabase/functions/_shared/application.ts");
  const parse = (re, what) => {
    const m = re.exec(src);
    if (!m) throw new Error("Can't find " + what + " in application.ts (did its layout change?)");
    return [...m[1].matchAll(/name:\s*"([^"]+)"[^}]*?max:\s*(\d+)/g)].map((x) => ({ name: x[1], max: Number(x[2]) }));
  };
  return {
    common: parse(/const COMMON[^=]*=\s*\[([\s\S]*?)\n\];/, "COMMON"),
    mentor: parse(/\n  mentor: \[([\s\S]*?)\n  \],/, "ANSWERS.mentor"),
    mentee: parse(/\n  mentee: \[([\s\S]*?)\n  \],/, "ANSWERS.mentee"),
    checks: parse(/const CHECKS[^=]*=\s*\[([\s\S]*?)\n\];/, "CHECKS"),
  };
}
