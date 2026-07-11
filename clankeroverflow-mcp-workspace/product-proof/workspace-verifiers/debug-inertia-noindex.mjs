import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.argv[2], "app.blade.php"), "utf8");
if (!/noindex/i.test(source) && !/X-Robots-Tag/i.test(source)) {
  throw new Error("Expected noindex to be emitted server-side.");
}
