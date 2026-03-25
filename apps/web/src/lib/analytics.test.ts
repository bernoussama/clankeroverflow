import { describe, expect, it, mock } from "bun:test";

describe("analytics", () => {
  it("trackEvent no-ops when client is null and captures when client is set", async () => {
    const capture = mock(() => {});
    const fakeClient = { capture } as unknown as import("posthog-js").PostHog;

    const { trackEvent, setPosthogClient } = await import("./analytics");

    setPosthogClient(null);
    trackEvent("ignored");
    expect(capture).not.toHaveBeenCalled();

    setPosthogClient(fakeClient);
    trackEvent("test_event", { mode: "hybrid" });
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0]).toEqual(["test_event", { mode: "hybrid" }]);
  });
});
