import { readFileSync } from "node:fs";

const source = readFileSync("db.mjs", "utf8");
if (/createBranch\(\)[\s\S]*return sql/.test(source)) {
  throw new Error("First query still runs immediately after branch creation.");
}
