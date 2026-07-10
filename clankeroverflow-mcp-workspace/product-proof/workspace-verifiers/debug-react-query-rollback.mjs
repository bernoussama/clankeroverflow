import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.argv[2], "mutation.js"), "utf8");
if (!/return\s+.*previous|context/i.test(source)) {
  throw new Error("Expected onMutate to return rollback context.");
}
if (!/onError[\s\S]*(context|previous)/.test(source)) {
  throw new Error("Expected onError to use the onMutate context.");
}
