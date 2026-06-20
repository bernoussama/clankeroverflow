import { spawn } from "node:child_process";

const IMAGE = process.env.CLANKER_LOCAL_E2E_IMAGE || "clankeroverflow-cli-local-e2e:latest";
const MODEL_VOLUME =
  process.env.CLANKER_LOCAL_E2E_MODEL_VOLUME || "clankeroverflow_cli_e2e_model_cache";

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

await run(["docker", "build", "-f", "packages/cli/e2e/Dockerfile.local-mode", "-t", IMAGE, "."]);
await run(["docker", "volume", "create", MODEL_VOLUME]);
await run([
  "docker",
  "run",
  "--rm",
  "-e",
  "XDG_CACHE_HOME=/model-cache",
  "-v",
  `${MODEL_VOLUME}:/model-cache`,
  IMAGE,
]);
