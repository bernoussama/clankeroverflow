import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.argv[2], "schema.prisma"), "utf8");
const assignment = source.match(/directUrl\s*=\s*env\(\s*["']([^"']+)["']\s*\)/);
if (!assignment) throw new Error("Expected datasource directUrl to use env(...).");
if (!/^(DIRECT_URL|DIRECT_DATABASE_URL|DATABASE_DIRECT_URL)$/.test(assignment[1])) {
  throw new Error("Expected direct URL env var for Prisma schema operations.");
}
const runtimeUrl = source.match(/(?<!direct)url\s*=\s*env\(\s*["']([^"']+)["']\s*\)/i)?.[1];
if (!runtimeUrl || runtimeUrl === assignment[1]) {
  throw new Error("Expected separate pooled runtime and direct schema URLs.");
}
