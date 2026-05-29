export type DatabaseEnv = {
  DATABASE_URL?: string;
  HYPERDRIVE?: {
    connectionString?: string;
  };
};

export type DatabaseExecutionRuntime = "node" | "worker";

export function resolveDatabaseEnv(databaseEnv: DatabaseEnv, fallbackDatabaseUrl?: string) {
  if (
    databaseEnv.DATABASE_URL ||
    databaseEnv.HYPERDRIVE?.connectionString ||
    !fallbackDatabaseUrl
  ) {
    return databaseEnv;
  }

  return {
    ...databaseEnv,
    HYPERDRIVE: {
      ...databaseEnv.HYPERDRIVE,
      connectionString: fallbackDatabaseUrl,
    },
  };
}

export function resolveConnectionString(databaseEnv: DatabaseEnv) {
  return databaseEnv.DATABASE_URL ?? databaseEnv.HYPERDRIVE?.connectionString;
}

export function getDatabaseRuntime(
  databaseEnv: DatabaseEnv,
  executionRuntime: DatabaseExecutionRuntime = "node",
) {
  return databaseEnv.HYPERDRIVE?.connectionString && !databaseEnv.DATABASE_URL
    ? "request"
    : executionRuntime === "worker" && databaseEnv.DATABASE_URL
      ? "request"
      : "pooled";
}
