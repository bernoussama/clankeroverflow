import { describe, expect, it } from "bun:test";

import { getDatabaseRuntime, resolveConnectionString, resolveDatabaseEnv } from "./runtime";

describe("database runtime", () => {
  it("uses request-scoped clients when Hyperdrive is configured", () => {
    expect(
      getDatabaseRuntime({
        HYPERDRIVE: {
          connectionString: "postgresql://hyperdrive.example/neondb",
        },
      }),
    ).toBe("request");
  });

  it("uses the pooled runtime when only DATABASE_URL is configured", () => {
    expect(
      getDatabaseRuntime({
        DATABASE_URL: "postgresql://localhost:5432/clankeroverflow",
      }),
    ).toBe("pooled");
  });

  it("uses request-scoped clients for direct DATABASE_URL bindings in worker runtimes", () => {
    const runtime = (
      getDatabaseRuntime as unknown as (
        databaseEnv: Parameters<typeof getDatabaseRuntime>[0],
        executionRuntime: "worker" | "node",
      ) => ReturnType<typeof getDatabaseRuntime>
    )(
      {
        DATABASE_URL: "postgresql://localhost:5432/clankeroverflow",
      },
      "worker",
    );

    expect(runtime).toBe("request");
  });

  it("prefers DATABASE_URL over Hyperdrive when both are present", () => {
    expect(
      resolveConnectionString({
        DATABASE_URL: "postgresql://localhost:5432/clankeroverflow",
        HYPERDRIVE: {
          connectionString: "postgresql://hyperdrive.example/neondb",
        },
      }),
    ).toBe("postgresql://localhost:5432/clankeroverflow");
  });

  it("treats local process DATABASE_URL fallbacks as request-scoped worker connections", () => {
    const databaseEnv = resolveDatabaseEnv({}, "postgresql://localhost:5432/clankeroverflow");

    expect(databaseEnv.DATABASE_URL).toBeUndefined();
    expect(databaseEnv.HYPERDRIVE?.connectionString).toBe(
      "postgresql://localhost:5432/clankeroverflow",
    );
    expect(getDatabaseRuntime(databaseEnv)).toBe("request");
  });
});
