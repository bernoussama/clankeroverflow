import { readFileSync } from "node:fs";

const source = readFileSync("app.blade.php", "utf8");
if (!/noindex|X-Robots-Tag/i.test(source)) {
  throw new Error("Crawler directive is still missing from the server-rendered shell.");
}
