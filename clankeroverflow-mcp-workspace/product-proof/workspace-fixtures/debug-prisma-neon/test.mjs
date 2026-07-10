import { readFileSync } from "node:fs";

const source = readFileSync("schema.prisma", "utf8");
if (!/directUrl\s*=/.test(source)) {
  throw new Error("Schema operations still use only the runtime database URL.");
}
