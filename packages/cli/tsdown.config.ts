import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts", "./src/postinstall.ts"],
  format: ["esm"],
  clean: true,
  noExternal: ["@clankeroverflow/mcp-logger"],
  outDir: "dist",
});
