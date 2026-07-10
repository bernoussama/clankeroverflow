import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.argv[2], "webhook.mjs"), "utf8");
if (!source.includes("constructEventAsync")) throw new Error("Expected constructEventAsync.");
if (/constructEvent\(/.test(source))
  throw new Error("Expected sync constructEvent path to be removed.");
if (!/raw/i.test(source)) throw new Error("Expected raw body handling to be preserved.");
