import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const pkg = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf-8"));

const pluginJsonPaths = [
  path.join(packageRoot, ".claude-plugin", "plugin.json"),
  path.join(packageRoot, ".codex-plugin", "plugin.json"),
  path.join(packageRoot, "openclaw.plugin.json"),
];

for (const pluginJsonPath of pluginJsonPaths) {
  const pluginJson = JSON.parse(await readFile(pluginJsonPath, "utf-8"));

  pluginJson.version = pkg.version;

  await writeFile(pluginJsonPath, JSON.stringify(pluginJson, null, 2) + "\n");
  console.log(
    `Stamped ${path.relative(packageRoot, pluginJsonPath)} version: ${pluginJson.version}`,
  );
}
