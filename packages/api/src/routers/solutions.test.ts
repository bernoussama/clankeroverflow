import { describe, expect, test } from "vitest";

import { t } from "../index";
import { appRouter } from "./index";

const createCaller = t.createCallerFactory(appRouter);

describe("public corpus shutdown", () => {
  test("solution search tells callers to use the team knowledge base", async () => {
    const caller = createCaller({
      auth: null as never,
      db: {} as never,
      session: null,
      apiKey: null,
    });
    await expect(caller.solutions.search({ query: "TS2307" })).rejects.toThrow(
      /public solution corpus has been shut down/,
    );
  });
});
