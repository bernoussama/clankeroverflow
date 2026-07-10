import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.argv[2], "schema.prisma"), "utf8");
if (!/directUrl\s*=/.test(source)) throw new Error("Expected datasource directUrl.");
if (!/DIRECT_URL|DIRECT_DATABASE_URL|DATABASE_DIRECT_URL/.test(source)) {
  throw new Error("Expected direct URL env var for Prisma schema operations.");
}
