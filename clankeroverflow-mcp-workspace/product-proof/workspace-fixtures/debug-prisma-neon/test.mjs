import { readFileSync } from "node:fs";

const source = readFileSync("schema.prisma", "utf8");
const directUrl = source.match(/directUrl\s*=\s*env\(\s*["']([^"']+)["']\s*\)/)?.[1];
const runtimeUrl = source.match(/(?<!direct)url\s*=\s*env\(\s*["']([^"']+)["']\s*\)/i)?.[1];
if (!directUrl || !/^(DIRECT_URL|DIRECT_DATABASE_URL|DATABASE_DIRECT_URL)$/.test(directUrl)) {
  throw new Error("Schema operations still use only the runtime database URL.");
}
if (!runtimeUrl || runtimeUrl === directUrl)
  throw new Error("Runtime and schema URLs must differ.");
