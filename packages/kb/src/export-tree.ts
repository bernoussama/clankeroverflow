import type { TeamKnowledge } from "./engine";

export function exportTree(team: TeamKnowledge) {
  const files = [...team.docs.values()]
    .filter((doc) => !doc.deleted)
    .map((doc) => ({ path: doc.path, body: doc.markdown }));
  files.push({ path: "index.md", body: `${team.browse()}\n` });
  files.push({ path: "log.md", body: `${team.log()}\n` });
  return files;
}
