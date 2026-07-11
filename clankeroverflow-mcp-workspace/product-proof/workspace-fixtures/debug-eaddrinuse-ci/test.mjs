import { readFileSync } from "node:fs";

const source = readFileSync("server.mjs", "utf8");
if (/port\s*=\s*3000/.test(source) || /kill-port/.test(source)) {
  throw new Error("CI server still depends on a brittle fixed-port cleanup path.");
}
