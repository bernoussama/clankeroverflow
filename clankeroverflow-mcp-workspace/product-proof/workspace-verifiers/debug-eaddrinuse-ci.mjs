import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.argv[2], "server.mjs"), "utf8");
if (!/port\s*=\s*0/.test(source)) throw new Error("Expected CI server to bind to port 0.");
if (/kill-port/.test(source)) throw new Error("Expected kill-port cleanup to be removed.");
