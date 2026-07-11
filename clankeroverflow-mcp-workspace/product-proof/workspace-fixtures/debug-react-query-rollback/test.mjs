import { pathToFileURL } from "node:url";

const calls = [];
globalThis.cache = {
  get: () => ({ id: "item", value: "before" }),
  set: (...args) => calls.push(args),
  invalidate: () => calls.push(["invalidate"]),
};
const { mutation } = await import(`${pathToFileURL("mutation.js")}?test=${Date.now()}`);
const context = await mutation.onMutate({ id: "item", value: "after" });
if (!context || typeof context !== "object") throw new Error("onMutate did not return context.");
await mutation.onError(new Error("failed"), { id: "item", value: "after" }, context);
if (!calls.some((args) => JSON.stringify(args).includes("before"))) {
  throw new Error("Mutation failure did not restore the previous value.");
}
