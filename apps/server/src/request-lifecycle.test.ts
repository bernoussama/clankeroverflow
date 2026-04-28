import { describe, expect, test } from "bun:test";

import { createRequestResourceLifecycle } from "./request-lifecycle";

function createDeferred() {
  let resolve!: () => void;

  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return {
    promise,
    resolve,
  };
}

describe("request resource lifecycle", () => {
  test("closes immediately when no background tasks are scheduled", async () => {
    let closeCount = 0;

    const lifecycle = createRequestResourceLifecycle({
      close: async () => {
        closeCount += 1;
      },
      waitUntil: () => {},
    });

    await lifecycle.closeWhenReady();

    expect(closeCount).toBe(1);
  });

  test("defers closing until tracked waitUntil tasks settle", async () => {
    const deferred = createDeferred();
    const scheduledPromises: Promise<unknown>[] = [];
    let closeCount = 0;

    const lifecycle = createRequestResourceLifecycle({
      close: async () => {
        closeCount += 1;
      },
      waitUntil: (promise) => {
        scheduledPromises.push(promise);
      },
    });

    lifecycle.waitUntil?.(deferred.promise);
    await lifecycle.closeWhenReady();

    expect(closeCount).toBe(0);
    expect(scheduledPromises).toHaveLength(2);

    deferred.resolve();
    await scheduledPromises[1];

    expect(closeCount).toBe(1);
  });
});
