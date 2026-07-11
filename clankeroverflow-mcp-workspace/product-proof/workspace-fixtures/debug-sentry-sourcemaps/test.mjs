import { pathToFileURL } from "node:url";

const { default: config } = await import(`${pathToFileURL("sentry.config.js")}?test=${Date.now()}`);
if (typeof config?.release !== "string" || !config.release.trim() || !config?.sourcemaps?.assets) {
  throw new Error("Sentry config still lacks release-aware sourcemap upload handling.");
}
const hidden =
  config.sourcemaps.hidden === true ||
  config.hiddenSourceMap === true ||
  config.devtool === "hidden-source-map";
if (!hidden && !config.sourcemaps.filesToDeleteAfterUpload)
  throw new Error("Uploaded sourcemaps remain public.");
