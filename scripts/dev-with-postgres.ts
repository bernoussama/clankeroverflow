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
const DEFAULT_SCHEMA_SYNC_COMMAND = ["bun", "run", "db:push"];
const DEFAULT_DEV_COMMAND = ["bun", "run", "dev:bare"];
const SHUTDOWN_SIGNALS: SignalName[] = ["SIGINT", "SIGTERM"];

async function runCommand(cmd: string[]) {
  const proc = Bun.spawn({
    cmd,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`Command failed with exit code ${exitCode}: ${cmd.join(" ")}`);
  }
}

function spawnCommand(cmd: string[]): ChildProcessLike {
  const proc = Bun.spawn({
    cmd,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  return {
    exited: proc.exited,
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

if (import.meta.main) {
  const exitCode = await runDevWithPostgres();
  process.exit(exitCode);
}
