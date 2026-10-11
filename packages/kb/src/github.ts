import type { CatalogChange } from "./catalog";

export const CHANGE_TRAILER = "Clanker-Change";

export type GithubCommit = {
  path: string;
  markdown: string;
  message: string;
  seq: number;
};

export type InboundFile = {
  path: string;
  markdown: string;
  commitMessage: string;
  previousSyncedRev: number | null;
};

export type CurrentDoc = {
  path: string;
  rev: number;
  markdown: string;
};

export type InboundPlan =
  | { kind: "ignore"; path: string; reason: "bot-commit" | "unchanged" }
  | { kind: "write"; path: string; markdown: string; baseRev: number | null }
  | { kind: "conflict"; path: string; githubMarkdown: string; currentMarkdown: string };

export function commitMessage(change: CatalogChange) {
  const detail = change.message ? `${change.message}\n\n` : "";
  return `${change.op} ${change.path}\n\n${detail}${CHANGE_TRAILER}: ${change.seq}\n`;
}

export function isBotCommit(message: string) {
  return message.includes(`${CHANGE_TRAILER}:`);
}

export function conflictPath(path: string) {
  return `conflicts/${path}`;
}

export function planInbound(files: InboundFile[], current: CurrentDoc[]): InboundPlan[] {
  const byPath = new Map(current.map((doc) => [doc.path, doc]));
  return files.map((file) => {
    if (isBotCommit(file.commitMessage)) {
      return { kind: "ignore", path: file.path, reason: "bot-commit" };
    }
    const existing = byPath.get(file.path);
    if (!existing) {
      return { kind: "write", path: file.path, markdown: file.markdown, baseRev: null };
    }
    if (existing.markdown === file.markdown) {
      return { kind: "ignore", path: file.path, reason: "unchanged" };
    }
    const synced = file.previousSyncedRev ?? 0;
    if (existing.rev > synced) {
      return {
        kind: "conflict",
        path: file.path,
        githubMarkdown: file.markdown,
        currentMarkdown: existing.markdown,
      };
    }
    return { kind: "write", path: file.path, markdown: file.markdown, baseRev: existing.rev };
  });
}

export function outboundCommits(
  changes: CatalogChange[],
  markdownFor: (path: string) => string | undefined,
): GithubCommit[] {
  const commits: GithubCommit[] = [];
  for (const change of changes) {
    const markdown = markdownFor(change.path);
    if (markdown === undefined) continue;
    commits.push({
      path: change.path,
      markdown,
      message: commitMessage(change),
      seq: change.seq,
    });
  }
  return commits;
}
