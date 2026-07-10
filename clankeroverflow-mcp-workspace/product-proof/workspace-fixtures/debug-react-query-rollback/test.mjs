import { readFileSync } from "node:fs";

const source = readFileSync("mutation.js", "utf8");
if (!/onError[\s\S]*(previous|context)|return[\s\S]*(previous|context)/.test(source)) {
  throw new Error("Optimistic mutation still has no visible rollback path.");
}
