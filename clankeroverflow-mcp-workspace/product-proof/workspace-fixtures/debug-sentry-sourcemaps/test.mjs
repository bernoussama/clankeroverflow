import { readFileSync } from "node:fs";

const source = readFileSync("sentry.config.js", "utf8");
if (!/release/i.test(source)) {
  throw new Error("Sentry config still lacks release-aware sourcemap handling.");
}
