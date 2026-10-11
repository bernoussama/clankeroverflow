import { createHash } from "node:crypto";

import { renderIndex, renderLog, type CatalogChange } from "./catalog";
import { formatFixDocument, parseDocument } from "./document";
import { planDream, type DreamPlan } from "./dream";
import {
  conflictPath,
  outboundCommits,
  planInbound,
  type GithubCommit,
  type InboundFile,
  type InboundPlan,
} from "./github";
import { scrubFields, scrubText } from "./sanitize";
import { searchDocuments, type IndexedDocument } from "./search";
import { starterFiles } from "./template";
import type { DocStatus, FixDocument, KbDocument, SearchFilters } from "./types";

export type ChangeSource = "api" | "cli" | "web" | "github" | "dream";
export type ChangeOp = "create" | "update" | "append" | "confirm" | "delete" | "move";
export type ReviewPolicy = "auto" | "human";

export type TeamChange = CatalogChange & {
  docId: string;
  rev: number;
  externalRef: string | null;
  author: string | null;
  agent: string | null;
  session: string | null;
};

export type StoredDoc = {
  docId: string;
  path: string;
  rev: number;
  contentHash: string;
  markdown: string;
  deleted: boolean;
  searchable: boolean;
  updatedAt: number;
};

export type ObjectRecord = {
  body: string;
  metadata: Record<string, string>;
  putAt: number;
};

export interface ObjectStore {
  put(key: string, body: string, metadata: Record<string, string>): Promise<void>;
  get(key: string): Promise<ObjectRecord | null>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

export class MemoryObjectStore implements ObjectStore {
  readonly objects = new Map<string, ObjectRecord>();

  async put(key: string, body: string, metadata: Record<string, string>) {
    this.objects.set(key, { body, metadata, putAt: Date.now() });
  }

  async get(key: string) {
    return this.objects.get(key) ?? null;
  }

  async delete(key: string) {
    this.objects.delete(key);
  }

  async list(prefix: string) {
    return [...this.objects.keys()].filter((key) => key.startsWith(prefix));
  }
}

export type TeamWriteInput = {
  markdown: string;
  path: string;
  baseRev: number | null;
  source: ChangeSource;
  author?: string;
  agent?: string;
  session?: string;
  message?: string;
  force?: boolean;
  op?: ChangeOp;
};

export type TeamWriteResult =
  | { status: "written"; docId: string; path: string; rev: number; warnings: string[] }
  | { status: "conflict"; currentRev: number; currentMarkdown: string; path: string }
  | { status: "possible_duplicate"; path: string; docId: string };

function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function revisionKey(teamId: string, docId: string, rev: number) {
  return `kb/${teamId}/revs/${docId}/${String(rev).padStart(6, "0")}.md`;
}

function materializedKey(teamId: string, path: string) {
  return `kb/${teamId}/docs/${path}`;
}

function prepareMarkdown(path: string, markdown: string, author: string | undefined) {
  const warnings: string[] = [];
  const parsed = parseDocument(path, markdown);
  if (parsed.kind === "note") {
    const scrubbed = scrubText(markdown);
    warnings.push(...scrubbed.warnings);
    return {
      markdown: scrubbed.text.endsWith("\n") ? scrubbed.text : `${scrubbed.text}\n`,
      warnings,
    };
  }
  const scrubbed = scrubFields({
    title: parsed.title,
    problem: parsed.problem,
    rootCause: parsed.rootCause,
    solution: parsed.solution,
    verification: parsed.verification,
    notes: parsed.notes,
  });
  warnings.push(...scrubbed.warnings);
  const authors = parsed.authors?.length ? parsed.authors : author ? [author] : [];
  const next: FixDocument = {
    ...parsed,
    title: scrubbed.fields.title ?? parsed.title,
    problem: scrubbed.fields.problem ?? "",
    rootCause: scrubbed.fields.rootCause ?? "",
    solution: scrubbed.fields.solution ?? "",
    verification: scrubbed.fields.verification ?? "",
    notes: scrubbed.fields.notes ?? "",
    authors,
  };
  return { markdown: formatFixDocument(next), warnings };
}

function sameFix(left: KbDocument, right: KbDocument) {
  if (left.kind !== "fix" || right.kind !== "fix") return false;
  if (left.title.trim().toLowerCase() === right.title.trim().toLowerCase()) return true;
  const signatures = left.errorSignatures.filter((signature) => signature.length >= 4);
  const haystack = `${right.title}\n${right.problem}`.toLowerCase();
  return signatures.some(
    (signature) =>
      right.errorSignatures.some((item) => item.toLowerCase() === signature.toLowerCase()) &&
      haystack.includes(signature.toLowerCase()),
  );
}

export type TeamSnapshot = {
  reviewPolicy: ReviewPolicy;
  dreamCursor: number;
  dreamTokens: number;
  docs: StoredDoc[];
  changes: TeamChange[];
};

export function snapshotTeam(team: TeamKnowledge): TeamSnapshot {
  return {
    reviewPolicy: team.reviewPolicy,
    dreamCursor: team.dreamCursor,
    dreamTokens: team.dreamTokens,
    docs: [...team.docs.values()],
    changes: [...team.changes],
  };
}

export class TeamKnowledge {
  readonly docs = new Map<string, StoredDoc>();
  readonly changes: TeamChange[] = [];
  dreamCursor = 0;
  dreamTokens = 0;

  constructor(
    readonly teamId: string,
    private readonly objects: ObjectStore,
    readonly reviewPolicy: ReviewPolicy = "auto",
    private now: () => number = Date.now,
  ) {}

  static restore(
    teamId: string,
    objects: ObjectStore,
    snapshot: {
      docs: StoredDoc[];
      changes: TeamChange[];
      dreamCursor?: number;
      dreamTokens?: number;
    },
    reviewPolicy: ReviewPolicy = "auto",
  ) {
    const team = new TeamKnowledge(teamId, objects, reviewPolicy);
    for (const doc of snapshot.docs) team.docs.set(doc.docId, doc);
    team.changes.push(...snapshot.changes);
    team.dreamCursor = snapshot.dreamCursor ?? 0;
    team.dreamTokens = snapshot.dreamTokens ?? 0;
    return team;
  }

  private allDocuments(): IndexedDocument[] {
    return [...this.docs.values()]
      .filter((doc) => !doc.deleted && !doc.path.startsWith("transcripts/"))
      .map((doc) => ({
        layer: "team" as const,
        document: parseDocument(doc.path, doc.markdown),
      }));
  }

  listDocuments(): IndexedDocument[] {
    return this.allDocuments().filter((item) => {
      const stored = [...this.docs.values()].find((doc) => doc.path === item.document.path);
      return stored?.searchable !== false;
    });
  }

  read(path: string) {
    return [...this.docs.values()].find((doc) => doc.path === path && !doc.deleted);
  }

  search(query: string, options: { limit?: number; filters?: SearchFilters } = {}) {
    return searchDocuments(this.listDocuments(), query, options);
  }

  browse(area?: string) {
    return renderIndex(this.listDocuments(), area);
  }

  log() {
    return renderLog(this.changes);
  }

  history(path: string) {
    return this.changes.filter((change) => change.path === path);
  }

  changesSince(seq: number) {
    return this.changes.filter((change) => change.seq > seq);
  }

  async seedTemplate() {
    for (const file of starterFiles()) {
      if (this.read(file.path)) continue;
      await this.write({
        markdown: file.body,
        path: file.path,
        baseRev: null,
        source: "api",
        message: "starter template",
        force: true,
      });
    }
  }

  async write(input: TeamWriteInput): Promise<TeamWriteResult> {
    const author = input.author;
    const prepared = prepareMarkdown(input.path, input.markdown, author);
    const parsed = parseDocument(input.path, prepared.markdown);
    const existing = this.read(input.path);
    if (input.baseRev !== null) {
      if (!existing) {
        return { status: "conflict", currentRev: 0, currentMarkdown: "", path: input.path };
      }
      if (existing.rev !== input.baseRev) {
        return {
          status: "conflict",
          currentRev: existing.rev,
          currentMarkdown: existing.markdown,
          path: input.path,
        };
      }
    } else if (existing) {
      return {
        status: "conflict",
        currentRev: existing.rev,
        currentMarkdown: existing.markdown,
        path: input.path,
      };
    }

    if (!input.force && input.baseRev === null && parsed.kind === "fix") {
      const duplicate = this.allDocuments().find((item) => sameFix(item.document, parsed));
      if (duplicate) {
        return {
          status: "possible_duplicate",
          path: duplicate.document.path,
          docId: duplicate.document.id,
        };
      }
    }

    const rev = (existing?.rev ?? 0) + 1;
    const parsedId = parsed.kind === "fix" ? parsed.id : input.path;
    const idOwner = this.docs.get(parsedId);
    const docId =
      existing?.docId ?? (idOwner && idOwner.path !== input.path ? input.path : parsedId);
    let markdown = prepared.markdown;
    if (parsed.kind === "fix") {
      const status: DocStatus =
        input.op === "confirm" || (input.baseRev !== null && input.source !== "dream")
          ? parsed.status
          : "draft";
      markdown = formatFixDocument({ ...parsed, status, path: input.path, id: docId });
    }
    const stored: StoredDoc = {
      docId,
      path: input.path,
      rev,
      contentHash: hashText(markdown),
      markdown,
      deleted: false,
      searchable: this.reviewPolicy === "auto" || input.source !== "api" || input.baseRev !== null,
      updatedAt: this.now(),
    };
    if (this.reviewPolicy === "human" && input.baseRev === null) stored.searchable = false;
    if (input.source === "dream") stored.searchable = true;
    await this.objects.put(revisionKey(this.teamId, docId, rev), markdown, {
      docId,
      rev: String(rev),
      contentHash: stored.contentHash,
      author: author ?? "",
    });
    await this.objects.put(materializedKey(this.teamId, input.path), markdown, {
      docId,
      rev: String(rev),
      contentHash: stored.contentHash,
      author: author ?? "",
    });
    this.docs.set(docId, stored);
    this.changes.push({
      seq: this.changes.length + 1,
      docId,
      path: input.path,
      rev,
      op: input.op ?? (existing ? "update" : "create"),
      source: input.source,
      externalRef: null,
      author: author ?? null,
      agent: input.agent ?? null,
      session: input.session ?? null,
      message: input.message ?? null,
      createdAt: new Date(this.now()).toISOString(),
    });
    return { status: "written", docId, path: input.path, rev, warnings: prepared.warnings };
  }

  async confirm(path: string, worked: boolean, actor?: string) {
    const existing = this.read(path);
    if (!existing) throw new Error(`No document at ${path}.`);
    const parsed = parseDocument(path, existing.markdown);
    if (parsed.kind !== "fix") throw new Error(`Cannot confirm a note at ${path}.`);
    const authors = parsed.authors ?? [];
    const self = Boolean(actor && authors.includes(actor));
    const next: FixDocument = { ...parsed };
    if (worked && !self) {
      next.confirmations += 1;
      if (next.status === "draft") next.status = "verified";
      next.lastVerified = new Date(this.now()).toISOString().slice(0, 10);
      existing.searchable = true;
    } else if (!worked) {
      next.confirmations = Math.max(0, next.confirmations - 1);
      if (next.confirmations === 0) next.status = "stale";
    }
    next.updated = new Date(this.now()).toISOString().slice(0, 10);
    return this.write({
      markdown: formatFixDocument(next),
      path,
      baseRev: existing.rev,
      source: "api",
      author: actor,
      message: self ? "author confirmation ignored" : worked ? "confirmed" : "failed",
      force: true,
      op: "confirm",
    });
  }

  async remove(path: string, author?: string) {
    const existing = this.read(path);
    if (!existing) return;
    existing.deleted = true;
    existing.searchable = false;
    await this.objects.delete(materializedKey(this.teamId, path));
    this.changes.push({
      seq: this.changes.length + 1,
      docId: existing.docId,
      path,
      rev: existing.rev,
      op: "delete",
      source: "api",
      externalRef: null,
      author: author ?? null,
      agent: null,
      session: null,
      message: "deleted",
      createdAt: new Date(this.now()).toISOString(),
    });
  }

  planDream(tokenBudget: number): DreamPlan {
    return planDream({
      documents: this.listDocuments(),
      changes: this.changes,
      tokenBudget,
      lastCursor: this.dreamCursor,
    });
  }

  async runDream(tokenBudget: number) {
    const plan = this.planDream(tokenBudget);
    if (plan.skipped) return plan;
    for (const draft of plan.drafts) {
      await this.write({
        markdown: draft.markdown,
        path: draft.path,
        baseRev: this.read(draft.path)?.rev ?? null,
        source: "dream",
        author: "dream",
        message: "dream draft",
        force: true,
      });
    }
    this.dreamCursor = this.changes.at(-1)?.seq ?? this.dreamCursor;
    this.dreamTokens += plan.tokens;
    return plan;
  }

  planGithubInbound(files: InboundFile[]): InboundPlan[] {
    return planInbound(
      files,
      [...this.docs.values()]
        .filter((doc) => !doc.deleted)
        .map((doc) => ({ path: doc.path, rev: doc.rev, markdown: doc.markdown })),
    );
  }

  async applyGithubInbound(files: InboundFile[]) {
    const plans = this.planGithubInbound(files);
    const applied: Array<TeamWriteResult | InboundPlan> = [];
    for (const plan of plans) {
      if (plan.kind === "ignore") {
        applied.push(plan);
        continue;
      }
      if (plan.kind === "conflict") {
        const saved = await this.write({
          markdown: plan.githubMarkdown,
          path: conflictPath(plan.path),
          baseRev: this.read(conflictPath(plan.path))?.rev ?? null,
          source: "github",
          message: `conflict with ${plan.path}`,
          force: true,
        });
        applied.push(saved);
        continue;
      }
      applied.push(
        await this.write({
          markdown: plan.markdown,
          path: plan.path,
          baseRev: plan.baseRev,
          source: "github",
          message: "github import",
          force: true,
        }),
      );
    }
    return applied;
  }

  outboundGithub(sinceSeq: number): GithubCommit[] {
    return outboundCommits(this.changesSince(sinceSeq), (path) => this.read(path)?.markdown);
  }

  async reconcile(orphanAfterMs = 86_400_000) {
    const repaired: string[] = [];
    const deletedOrphans: string[] = [];
    for (const doc of this.docs.values()) {
      if (doc.deleted) continue;
      const key = materializedKey(this.teamId, doc.path);
      const current = await this.objects.get(key);
      if (!current || current.body !== doc.markdown) {
        await this.objects.put(key, doc.markdown, {
          docId: doc.docId,
          rev: String(doc.rev),
          contentHash: doc.contentHash,
          author: "",
        });
        repaired.push(doc.path);
      }
    }
    const prefix = `kb/${this.teamId}/revs/`;
    const now = this.now();
    for (const key of await this.objects.list(prefix)) {
      const object = await this.objects.get(key);
      if (!object) continue;
      const doc = this.docs.get(object.metadata.docId ?? "");
      const rev = Number(object.metadata.rev ?? "0");
      if (!doc || rev >= doc.rev) continue;
      if (now - object.putAt < orphanAfterMs) continue;
      await this.objects.delete(key);
      deletedOrphans.push(key);
    }
    return { repaired, deletedOrphans };
  }
}
