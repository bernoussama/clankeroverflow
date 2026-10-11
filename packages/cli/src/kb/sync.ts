import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type RemoteChange = {
  seq: number;
  path: string;
  rev: number;
  op: string;
};

export type SyncState = {
  cursor: number;
  revisions: Record<string, number>;
};

export type TeamRemote = {
  changes(since: number): Promise<RemoteChange[]>;
  read(path: string): Promise<{ rev: number; markdown: string } | null>;
  write(input: {
    path: string;
    markdown: string;
    baseRev: number | null;
  }): Promise<{
    status: "written" | "conflict" | "possible_duplicate";
    rev?: number;
    markdown?: string;
  }>;
};

const STATE_FILE = ".sync.json";

export function readSyncState(root: string): SyncState {
  try {
    const parsed = JSON.parse(readFileSync(join(root, STATE_FILE), "utf8")) as SyncState;
    return { cursor: parsed.cursor ?? 0, revisions: parsed.revisions ?? {} };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { cursor: 0, revisions: {} };
    throw error;
  }
}

export function writeSyncState(root: string, state: SyncState) {
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, STATE_FILE), `${JSON.stringify(state, null, 2)}\n`);
}

function conflictPath(path: string) {
  return path.replace(/\.md$/, ".conflict.md");
}

export async function pullTeam(root: string, remote: TeamRemote) {
  const state = readSyncState(root);
  const changes = await remote.changes(state.cursor);
  const conflicts: string[] = [];
  let pulled = 0;
  for (const change of changes) {
    state.cursor = Math.max(state.cursor, change.seq);
    if (change.op === "delete") {
      state.revisions[change.path] = change.rev;
      continue;
    }
    const remoteDoc = await remote.read(change.path);
    if (!remoteDoc) continue;
    const absolute = join(root, change.path);
    let local = "";
    try {
      local = readFileSync(absolute, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const knownRev = state.revisions[change.path];
    if (
      local &&
      knownRev !== undefined &&
      knownRev !== change.rev - 1 &&
      local !== remoteDoc.markdown
    ) {
      mkdirSync(dirname(join(root, conflictPath(change.path))), { recursive: true });
      writeFileSync(join(root, conflictPath(change.path)), remoteDoc.markdown);
      conflicts.push(change.path);
      continue;
    }
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, remoteDoc.markdown);
    state.revisions[change.path] = remoteDoc.rev;
    pulled += 1;
  }
  writeSyncState(root, state);
  return { pulled, conflicts, cursor: state.cursor };
}

export async function pushTeam(
  root: string,
  remote: TeamRemote,
  files: Array<{ path: string; markdown: string }>,
) {
  const state = readSyncState(root);
  const conflicts: string[] = [];
  let pushed = 0;
  for (const file of files) {
    const baseRev = state.revisions[file.path] ?? null;
    const result = await remote.write({ path: file.path, markdown: file.markdown, baseRev });
    if (result.status === "conflict") {
      writeFileSync(join(root, conflictPath(file.path)), result.markdown ?? file.markdown);
      conflicts.push(file.path);
      continue;
    }
    if (result.rev) state.revisions[file.path] = result.rev;
    pushed += 1;
  }
  writeSyncState(root, state);
  return { pushed, conflicts };
}

export function httpTeamRemote(options: {
  serverUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}): TeamRemote {
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers = { "content-type": "application/json", "x-clanker-api-key": options.apiKey };
  return {
    async changes(since) {
      const response = await fetchImpl(`${options.serverUrl}/kb/changes?since=${since}`, {
        headers,
      });
      if (!response.ok) throw new Error(`Pull failed (${response.status}).`);
      const body = (await response.json()) as { changes: RemoteChange[] };
      return body.changes;
    },
    async read(path) {
      const response = await fetchImpl(
        `${options.serverUrl}/kb/documents?path=${encodeURIComponent(path)}`,
        { headers },
      );
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Read failed (${response.status}).`);
      return (await response.json()) as { rev: number; markdown: string };
    },
    async write(input) {
      const response = await fetchImpl(`${options.serverUrl}/kb/documents`, {
        method: "PUT",
        headers,
        body: JSON.stringify(input),
      });
      if (response.status === 409) {
        const body = (await response.json()) as { markdown?: string };
        return { status: "conflict", markdown: body.markdown };
      }
      if (!response.ok) throw new Error(`Push failed (${response.status}).`);
      const body = (await response.json()) as {
        status: "written" | "possible_duplicate";
        rev?: number;
      };
      return body;
    },
  };
}
