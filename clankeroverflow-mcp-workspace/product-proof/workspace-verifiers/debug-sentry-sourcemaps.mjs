import { join } from "node:path";
import { pathToFileURL } from "node:url";

const { default: config } = await import(
  `${pathToFileURL(join(process.argv[2], "sentry.config.js"))}?verify=${Date.now()}`
);
if (typeof config?.release !== "string" || !config.release.trim())
  throw new Error("Expected a non-empty release.");
if (!config?.sourcemaps?.assets) throw new Error("Expected sourcemap upload assets.");
const hidden =
  config.sourcemaps.hidden === true ||
  config.hiddenSourceMap === true ||
  config.devtool === "hidden-source-map";
if (!hidden && !config.sourcemaps.filesToDeleteAfterUpload) {
  throw new Error("Expected hidden sourcemaps or deletion after upload.");
}
