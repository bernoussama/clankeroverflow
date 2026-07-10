import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("package-under-test.json", "utf8"));
if (!manifest.dependencies?.["@acme/ui"]) {
  throw new Error("Workspace import cannot be resolved from the consuming package manifest.");
}
