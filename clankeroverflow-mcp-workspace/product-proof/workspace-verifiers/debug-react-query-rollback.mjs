import { pathToFileURL } from "node:url";
import { join } from "node:path";

const calls = [];
globalThis.cache = {
  get: () => ({ id: "item", value: "before" }),
  set: (...args) => calls.push(args),
  invalidate: () => calls.push(["invalidate"]),
};
const { mutation } = await import(
  `${pathToFileURL(join(process.argv[2], "mutation.js"))}?verify=${Date.now()}`
);
const context = await mutation.onMutate({ id: "item", value: "after" });
if (!context || typeof context !== "object")
  throw new Error("Expected onMutate to return rollback context.");
await mutation.onError(new Error("failed"), { id: "item", value: "after" }, context);
if (!calls.some((args) => JSON.stringify(args).includes("before"))) {
  throw new Error("Expected onError to restore the previous value from mutation context.");
}
