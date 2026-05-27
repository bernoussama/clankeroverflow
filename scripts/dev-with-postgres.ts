import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

type SignalName = "SIGINT" | "SIGTERM";

type ChildProcessLike = {
  exited: Promise<number>;
  kill: (signal?: SignalName) => void;
};

type RunDevWithPostgresOptions = {
  composeDownCommand?: string[];
  composeUpCommand?: string[];
  devCommand?: string[];
  schemaSyncCommand?: string[];
  registerSignalHandler?: (signal: SignalName, handler: () => void) => () => void;
  runCommand?: (cmd: string[]) => Promise<void>;
  spawnCommand?: (cmd: string[]) => ChildProcessLike;
};

const DEFAULT_COMPOSE_UP_COMMAND = ["docker", "compose", "up", "-d", "--wait"];
const DEFAULT_COMPOSE_DOWN_COMMAND = ["docker", "compose", "down"];
const DEFAULT_SCHEMA_SYNC_COMMAND = ["pnpm", "run", "db:push"];
const DEFAULT_DEV_COMMAND = ["pnpm", "run", "dev:bare"];
const SHUTDOWN_SIGNALS: SignalName[] = ["SIGINT", "SIGTERM"];

async function runCommand(cmd: string[]) {
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

function spawnCommand(cmd: string[]): ChildProcessLike {
  const proc = spawn(cmd[0]!, cmd.slice(1), {
    stdio: "inherit",
  });

  return {
    exited: new Promise<number>((resolveProcess, rejectProcess) => {
      proc.on("error", rejectProcess);
      proc.on("exit", (code) => resolveProcess(code ?? 0));
    }),
    kill: (signal) => {
      proc.kill(signal);
    },
  };
}

function registerSignalHandler(signal: SignalName, handler: () => void) {
  process.on(signal, handler);

  return () => {
    process.off(signal, handler);
  };
}

export async function runDevWithPostgres({
  composeDownCommand = DEFAULT_COMPOSE_DOWN_COMMAND,
  composeUpCommand = DEFAULT_COMPOSE_UP_COMMAND,
  devCommand = DEFAULT_DEV_COMMAND,
  schemaSyncCommand = DEFAULT_SCHEMA_SYNC_COMMAND,
  registerSignalHandler: addSignalHandler = registerSignalHandler,
  runCommand: executeCommand = runCommand,
  spawnCommand: startCommand = spawnCommand,
}: RunDevWithPostgresOptions = {}) {
  await executeCommand(composeUpCommand);

  try {
    await executeCommand(schemaSyncCommand);

    const devProcess = startCommand(devCommand);
    const unregisterSignalHandlers = SHUTDOWN_SIGNALS.map((signal) =>
      addSignalHandler(signal, () => {
        devProcess.kill(signal);
      }),
    );

    try {
      return await devProcess.exited;
    } finally {
      for (const unregister of unregisterSignalHandlers) {
        unregister();
      }
    }
  } finally {
    await executeCommand(composeDownCommand);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const exitCode = await runDevWithPostgres();
  process.exit(exitCode);
}
