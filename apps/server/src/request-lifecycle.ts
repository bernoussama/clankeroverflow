type WaitUntilHandler = (promise: Promise<unknown>) => void;

type RequestResourceLifecycleOptions = {
  close: () => Promise<void>;
  waitUntil?: WaitUntilHandler;
};

export function createRequestResourceLifecycle({
  close,
  waitUntil,
}: RequestResourceLifecycleOptions) {
  const backgroundTasks: Promise<unknown>[] = [];

  const trackBackgroundTask = waitUntil
    ? (promise: Promise<unknown>) => {
        const trackedPromise = Promise.resolve(promise);
        backgroundTasks.push(trackedPromise);
        waitUntil(trackedPromise);
      }
    : undefined;

  async function closeWhenReady() {
    if (!waitUntil || backgroundTasks.length === 0) {
      await close();
      return;
    }

    waitUntil(
      Promise.allSettled(backgroundTasks).then(async () => {
        await close();
      }),
    );
  }

  return {
    closeWhenReady,
    waitUntil: trackBackgroundTask,
  };
}
