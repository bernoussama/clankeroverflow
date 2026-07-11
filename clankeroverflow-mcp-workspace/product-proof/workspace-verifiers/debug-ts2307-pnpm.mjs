import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
const manifest = JSON.parse(readFileSync(join(root, "package-under-test.json"), "utf8"));
if (manifest.dependencies?.["@acme/ui"] !== "workspace:*") {
  throw new Error("Expected @acme/ui to be declared as a workspace:* dependency.");
}
