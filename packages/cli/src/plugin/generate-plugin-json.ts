import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const pkg = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf-8"));

const pluginJsonPath = path.join(packageRoot, ".claude-plugin", "plugin.json");
const pluginJson = JSON.parse(await readFile(pluginJsonPath, "utf-8"));

pluginJson.version = pkg.version;

await writeFile(pluginJsonPath, JSON.stringify(pluginJson, null, 2) + "\n");
console.log(`Stamped plugin.json version: ${pluginJson.version}`);
