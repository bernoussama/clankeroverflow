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
  const pluginJsonSource = await readFile(pluginJsonPath, "utf-8");
  const pluginJson = JSON.parse(pluginJsonSource);

  pluginJson.version = pkg.version;

  const versionLinePattern = /^  "version": ".*",$/m;
  if (!versionLinePattern.test(pluginJsonSource)) {
    throw new Error(`Missing version field in ${pluginJsonPath}`);
  }

  await writeFile(
    pluginJsonPath,
    pluginJsonSource.replace(versionLinePattern, `  "version": ${JSON.stringify(pkg.version)},`),
  );
  console.log(
    `Stamped ${path.relative(packageRoot, pluginJsonPath)} version: ${pluginJson.version}`,
  );
}
