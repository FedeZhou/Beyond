// A tiny static web server for the frontend tests: serves the repository the
// way Vercel serves dist/. js/config.js decides the mode:
//   "demo" → no config.js (404): every members page runs in demo mode
//   "mock" → config.js points at https://mock.supabase.co, which the tests
//            answer themselves (see mock-supabase.mjs): nothing reaches Supabase
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const MOCK_URL = "https://mock.supabase.co";
export const MOCK_KEY = "sb_publishable_test_key";

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".png": "image/png", ".json": "application/json",
};
// Only what Vercel publishes (scripts/build.mjs): pages, css/, js/, assets/
const PUBLIC = /^\/([\w-]+\.html|css\/.+|js\/.+|assets\/.+)$/;

export async function startServer({ mode = "demo" } = {}) {
  const server = createServer(async (req, res) => {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path === "/") path = "/index.html";
    if (path === "/js/config.js") {
      if (mode === "demo") { res.writeHead(404); return res.end("not found"); }
      res.writeHead(200, { "Content-Type": TYPES[".js"] });
      return res.end(`window.BEYOND_CONFIG = ${JSON.stringify({ supabaseUrl: MOCK_URL, supabaseAnonKey: MOCK_KEY })};`);
    }
    if (!PUBLIC.test(path) || path.includes("..")) { res.writeHead(404); return res.end("not found"); }
    try {
      const body = await readFile(join(ROOT, normalize(path)));
      res.writeHead(200, { "Content-Type": TYPES[extname(path)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404); res.end("not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}
