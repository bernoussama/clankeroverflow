import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const distPostinstallPath = path.join(packageRoot, "dist", "postinstall.mjs");

if (existsSync(distPostinstallPath)) {
  const { runPostinstall } = await import(pathToFileURL(distPostinstallPath).href);
  await runPostinstall();
}
