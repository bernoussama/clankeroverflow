import { join } from "node:path";
import { pathToFileURL } from "node:url";

const { createBranchAndQuery } = await import(
  `${pathToFileURL(join(process.argv[2], "db.mjs"))}?verify=${Date.now()}`
);
const calls = [];
let readinessAttempts = 0;
const neon = { createBranch: async () => calls.push("createBranch") };
const sql = async (strings) => {
  const query = strings.join("");
  calls.push(query);
  if (/select\s+1/i.test(query) && readinessAttempts++ === 0) throw new Error("branch not ready");
  return query;
};
await createBranchAndQuery(neon, sql);
const readiness = calls.filter((call) => /select\s+1/i.test(call));
const userQueryIndex = calls.findIndex((call) => /from\s+users/i.test(call));
if (readiness.length < 2)
  throw new Error("Expected readiness query retry after a transient failure.");
if (userQueryIndex < 0 || userQueryIndex <= calls.lastIndexOf(readiness.at(-1))) {
  throw new Error("Expected application query only after readiness succeeds.");
}
