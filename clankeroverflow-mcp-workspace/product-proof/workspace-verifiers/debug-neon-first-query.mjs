import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.argv[2], "db.mjs"), "utf8");
if (/createBranch\(\);\s*return sql/.test(source)) {
  throw new Error("Expected first query not to run immediately after branch creation.");
}
if (!/select\s+1/i.test(source)) throw new Error("Expected lightweight readiness query.");
if (!/retry|backoff|timeout|setTimeout|attempt/i.test(source)) {
  throw new Error("Expected retry/backoff for first query.");
}
