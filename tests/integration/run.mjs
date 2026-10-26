// Starts the integration tests (npm run test:integration).
// Checks the run limit ONCE for all integration files (at least 60 minutes
// apart, at most 4 a day), records the run, then runs the files one by one.
// The test files refuse to run without this launcher, so the limit can't be skipped.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { checkRunBudget } from "../helpers/live.mjs";

const budget = checkRunBudget();
if (!budget.ok) {
  console.log("Integration tests not started: " + budget.reason + ".");
  console.log("(This limit keeps test emails and applications far below anything that could look like spam.)");
  process.exit(1);
}
await budget.record();

const dir = new URL(".", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".test.mjs")).sort().map((f) => new URL(f, dir).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const result = spawnSync(process.execPath, ["--test", "--test-reporter=spec", "--test-concurrency=1", ...files], {
  stdio: "inherit",
  env: { ...process.env, BEYOND_INTEGRATION_RUN: Date.now().toString(36) },
});
process.exit(result.status ?? 1);
