import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts", "./src/postinstall.ts", "./src/plugin/install.ts", "./src/plugin/generate-plugin-json.ts"],
  format: ["esm"],
  clean: true,
  outDir: "dist",
});
