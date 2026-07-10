import { readFileSync } from "node:fs";

const source = readFileSync("webhook.mjs", "utf8");
if (/constructEvent\(/.test(source)) {
  throw new Error("Webhook verifier still uses the sync Node-oriented Stripe path.");
}
