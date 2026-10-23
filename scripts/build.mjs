// BEYOND — build for Vercel (run automatically by Vercel, see vercel.json).
//
// Copies the website into dist/ (only what visitors need: the pages, css/, js/
// and assets/; not supabase/, .github/ or the README), and writes
// dist/js/config.js from two Vercel environment variables:
//   SUPABASE_URL       e.g. https://abcdefgh.supabase.co
//   SUPABASE_ANON_KEY  the "anon public" key, never the service_role key
// Without them the site still builds; the members pages show demo mode.
//
// Try it on your computer: node scripts/build.mjs   (then look inside dist/)

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist");

rmSync(out, { recursive: true, force: true });
mkdirSync(out);

for (const name of readdirSync(root)) {
  if (name.endsWith(".html")) cpSync(join(root, name), join(out, name));
}
for (const folder of ["css", "js", "assets"]) {
  if (existsSync(join(root, folder))) cpSync(join(root, folder), join(out, folder), { recursive: true });
}

const config = {
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
};
writeFileSync(
  join(out, "js", "config.js"),
  "// Written by scripts/build.mjs while publishing. Do not edit.\nwindow.BEYOND_CONFIG = " +
    JSON.stringify(config, null, 2) + ";\n",
);

if (!config.supabaseUrl || !config.supabaseAnonKey) {
  console.log("No SUPABASE_URL / SUPABASE_ANON_KEY yet: the members pages will run in demo mode.");
}
console.log("Built the site into dist/");
