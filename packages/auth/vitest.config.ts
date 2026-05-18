import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["../../apps/server/test-setup.ts"],
  },
});
