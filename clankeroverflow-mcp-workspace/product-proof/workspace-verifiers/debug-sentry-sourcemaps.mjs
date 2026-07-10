import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.argv[2], "sentry.config.js"), "utf8");
if (!/hidden-source-map|filesToDeleteAfterUpload|release/i.test(source)) {
  throw new Error("Expected hidden sourcemap upload/release configuration.");
}
