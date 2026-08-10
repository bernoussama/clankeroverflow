import { spawn } from "node:child_process";

const DEFAULT_NODE_IMAGES = ["node:22-bookworm-slim", "node:24-bookworm-slim"];
const NODE_IMAGES = (process.env.CLANKER_LOCAL_E2E_NODE_IMAGES?.split(",") ?? DEFAULT_NODE_IMAGES)
  .map((image) => image.trim())
  .filter(Boolean);

if (NODE_IMAGES.length === 0) {
  throw new Error("CLANKER_LOCAL_E2E_NODE_IMAGES must include at least one Docker image.");
}

function imageName(nodeImage: string) {
  if (process.env.CLANKER_LOCAL_E2E_IMAGE) return process.env.CLANKER_LOCAL_E2E_IMAGE;
  const suffix = nodeImage
    .replace(/^node:/, "node-")
    .replaceAll(/[^a-zA-Z0-9_.-]+/g, "-")
    .toLowerCase();
  return `clankeroverflow-cli-local-e2e:${suffix}`;
}

async function run(cmd: string[]) {
  const proc = spawn(cmd[0]!, cmd.slice(1), {
    stdio: "inherit",
  });

  const exitCode = await new Promise<number | null>((resolveProcess, rejectProcess) => {
    proc.on("error", rejectProcess);
    proc.on("exit", resolveProcess);
  });

  if (exitCode !== 0) {
    throw new Error(`Command failed with exit code ${exitCode}: ${cmd.join(" ")}`);
  }
}

for (const nodeImage of NODE_IMAGES) {
  const image = imageName(nodeImage);
  console.log(`[local-mode-e2e] building ${image} from ${nodeImage}`);
  await run([
    "docker",
    "build",
    "--build-arg",
    `NODE_IMAGE=${nodeImage}`,
    "-f",
    "packages/cli/e2e/Dockerfile.local-mode",
    "-t",
    image,
    ".",
  ]);
  console.log(`[local-mode-e2e] running ${image}`);
  await run(["docker", "run", "--rm", image]);
}
