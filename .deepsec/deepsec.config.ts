import { defineConfig } from "deepsec/config";

export default defineConfig({
  projects: [
    { id: "clankeroverflow", root: ".." },
    // <deepsec:projects-insert-above>
  ],
});
