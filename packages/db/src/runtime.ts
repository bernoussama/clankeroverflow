export type DatabaseEnv = {
  DATABASE_URL?: string;
  HYPERDRIVE?: {
    connectionString?: string;
  };
};

export function resolveConnectionString(databaseEnv: DatabaseEnv) {
  return databaseEnv.DATABASE_URL ?? databaseEnv.HYPERDRIVE?.connectionString;
}

export function getDatabaseRuntime(databaseEnv: DatabaseEnv) {
  return databaseEnv.HYPERDRIVE?.connectionString && !databaseEnv.DATABASE_URL
    ? "request"
    : "pooled";
}
