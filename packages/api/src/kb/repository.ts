import { eq } from "drizzle-orm";
import {
  kbChange,
  kbDocument,
  team,
  teamKb,
  teamMember,
} from "@clankeroverflow/db/schema/knowledge";
import type { Database } from "@clankeroverflow/db";
import {
  MemoryObjectStore,
  TeamKnowledge,
  snapshotTeam,
  type ObjectStore,
  type ReviewPolicy,
  type TeamChange,
  type TeamSnapshot,
} from "@clankeroverflow/kb";

export interface TeamRepository {
  load(teamId: string): Promise<TeamSnapshot | null>;
  save(teamId: string, snapshot: TeamSnapshot): Promise<void>;
  listTeamIds(): Promise<string[]>;
}

export class MemoryTeamRepository implements TeamRepository {
  private readonly snapshots = new Map<string, TeamSnapshot>();

  async load(teamId: string) {
    const snapshot = this.snapshots.get(teamId);
    return snapshot ? structuredClone(snapshot) : null;
  }

  async save(teamId: string, snapshot: TeamSnapshot) {
    this.snapshots.set(teamId, structuredClone(snapshot));
  }

  async listTeamIds() {
    return [...this.snapshots.keys()];
  }
}

function asPolicy(value: string | null | undefined): ReviewPolicy {
  return value === "human" ? "human" : "auto";
}

export class DrizzleTeamRepository implements TeamRepository {
  constructor(private readonly db: Database) {}

  async load(teamId: string): Promise<TeamSnapshot | null> {
    const [settings] = await this.db.select().from(teamKb).where(eq(teamKb.teamId, teamId));
    const docs = await this.db.select().from(kbDocument).where(eq(kbDocument.teamId, teamId));
    if (!settings && !docs.length) return null;
    const changes = await this.db.select().from(kbChange).where(eq(kbChange.teamId, teamId));
    return {
      reviewPolicy: asPolicy(settings?.reviewPolicy),
      dreamCursor: settings?.dreamCursor ?? 0,
      dreamTokens: settings?.dreamSpentTokens ?? 0,
      docs: docs.map((doc) => ({
        docId: doc.docId,
        path: doc.path,
        rev: doc.rev,
        contentHash: doc.contentHash,
        markdown: doc.markdown,
        deleted: doc.deleted,
        searchable: doc.searchable,
        updatedAt: doc.updatedAt.getTime(),
      })),
      changes: changes.map((change) => ({
        seq: change.seq,
        docId: change.docId,
        path: change.path,
        rev: change.rev,
        op: change.op as TeamChange["op"],
        source: change.source as TeamChange["source"],
        externalRef: change.externalRef,
        author: change.author,
        agent: change.agent,
        session: change.session,
        message: change.message,
        createdAt: change.createdAt.toISOString(),
      })),
    };
  }

  async save(teamId: string, snapshot: TeamSnapshot) {
    await this.db
      .insert(team)
      .values({ id: teamId, name: teamId, slug: teamId })
      .onConflictDoNothing();
    await this.db
      .insert(teamMember)
      .values({ teamId, userId: teamId, role: "owner" })
      .onConflictDoNothing();
    await this.db
      .insert(teamKb)
      .values({
        teamId,
        r2Prefix: `kb/${teamId}`,
        reviewPolicy: snapshot.reviewPolicy,
        dreamCursor: snapshot.dreamCursor,
        dreamSpentTokens: snapshot.dreamTokens,
      })
      .onConflictDoUpdate({
        target: teamKb.teamId,
        set: {
          reviewPolicy: snapshot.reviewPolicy,
          dreamCursor: snapshot.dreamCursor,
          dreamSpentTokens: snapshot.dreamTokens,
        },
      });

    for (const doc of snapshot.docs) {
      const values = {
        teamId,
        docId: doc.docId,
        path: doc.path,
        rev: doc.rev,
        contentHash: doc.contentHash,
        frontmatter: { searchable: doc.searchable },
        body: doc.markdown,
        markdown: doc.markdown,
        deleted: doc.deleted,
        searchable: doc.searchable,
        updatedAt: new Date(doc.updatedAt),
      };
      await this.db
        .insert(kbDocument)
        .values(values)
        .onConflictDoUpdate({
          target: [kbDocument.teamId, kbDocument.docId],
          set: values,
        });
    }

    for (const change of snapshot.changes) {
      await this.db
        .insert(kbChange)
        .values({
          teamId,
          seq: change.seq,
          docId: change.docId,
          path: change.path,
          rev: change.rev,
          op: change.op,
          source: change.source,
          externalRef: change.externalRef,
          author: change.author,
          agent: change.agent,
          session: change.session,
          message: change.message,
          createdAt: new Date(change.createdAt),
        })
        .onConflictDoNothing();
    }
  }

  async listTeamIds() {
    const rows = await this.db.select({ teamId: team.id }).from(team);
    return rows.map((row) => row.teamId);
  }
}

export type R2BucketLike = {
  put(
    key: string,
    value: string,
    options?: { customMetadata?: Record<string, string> },
  ): Promise<unknown>;
  get(
    key: string,
  ): Promise<{ text(): Promise<string>; customMetadata?: Record<string, string> } | null>;
  delete(key: string): Promise<unknown>;
  list(options?: { prefix?: string }): Promise<{ objects: Array<{ key: string }> }>;
};

export class R2ObjectStore implements ObjectStore {
  constructor(private readonly bucket: R2BucketLike) {}

  async put(key: string, body: string, metadata: Record<string, string>) {
    await this.bucket.put(key, body, { customMetadata: metadata });
  }

  async get(key: string) {
    const object = await this.bucket.get(key);
    if (!object) return null;
    return {
      body: await object.text(),
      metadata: object.customMetadata ?? {},
      putAt: Date.now(),
    };
  }

  async delete(key: string) {
    await this.bucket.delete(key);
  }

  async list(prefix: string) {
    const listed = await this.bucket.list({ prefix });
    return listed.objects.map((object) => object.key);
  }
}

export function isR2Bucket(value: unknown): value is R2BucketLike {
  if (!value || typeof value !== "object") return false;
  const bucket = value as R2BucketLike;
  return typeof bucket.put === "function" && typeof bucket.get === "function";
}

export async function openTeamSession(options: {
  repository: TeamRepository;
  objectStore?: ObjectStore;
  teamId: string;
}) {
  const objectStore = options.objectStore ?? new MemoryObjectStore();
  const snapshot = await options.repository.load(options.teamId);
  const team = snapshot
    ? TeamKnowledge.restore(options.teamId, objectStore, snapshot, snapshot.reviewPolicy)
    : new TeamKnowledge(options.teamId, objectStore, "auto");
  if (!snapshot) await team.seedTemplate();
  return {
    team,
    created: !snapshot,
    commit: async () => {
      await options.repository.save(options.teamId, snapshotTeam(team));
    },
  };
}

export async function dreamPersistedTeams(options: {
  repository: TeamRepository;
  objectStore?: ObjectStore;
  tokenBudget: number;
  model?: {
    complete(prompt: string, tokenBudget: number): Promise<{ text: string; tokens: number }>;
  } | null;
}) {
  const teamIds = await options.repository.listTeamIds();
  const runs = [];
  for (const teamId of teamIds) {
    const session = await openTeamSession({
      repository: options.repository,
      objectStore: options.objectStore,
      teamId,
    });
    const plan = session.team.planDream(options.tokenBudget);
    if (plan.skipped) {
      runs.push({ teamId, skipped: true, tokens: 0 });
      continue;
    }
    if (!options.model) {
      const dreamed = await session.team.runDream(options.tokenBudget);
      await session.commit();
      runs.push({ teamId, skipped: false, tokens: dreamed.tokens });
      continue;
    }
    const completion = await options.model.complete(
      plan.drafts.map((draft) => draft.markdown).join("\n\n"),
      options.tokenBudget,
    );
    const today = new Date().toISOString().slice(0, 10);
    await session.team.write({
      path: "dreams/model.md",
      baseRev: session.team.read("dreams/model.md")?.rev ?? null,
      source: "dream",
      author: "dream",
      message: "model dream",
      force: true,
      markdown: `# Dream\n\n- ${completion.text.replace(/\n/g, " ")} [source: dream; added: ${today}]\n`,
    });
    session.team.dreamCursor = session.team.changes.at(-1)?.seq ?? session.team.dreamCursor;
    session.team.dreamTokens += completion.tokens;
    await session.commit();
    runs.push({ teamId, skipped: false, tokens: completion.tokens });
  }
  return runs;
}
