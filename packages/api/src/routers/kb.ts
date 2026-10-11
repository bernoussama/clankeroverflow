import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  formatFixDocument,
  formatNoteEntry,
  lintDocuments,
  type TeamKnowledge,
} from "@clankeroverflow/kb";

import type { TeamRepository } from "../kb/repository";
import { DrizzleTeamRepository, openTeamSession } from "../kb/repository";
import { publicProcedure, router } from "../index";
import type { Database } from "@clankeroverflow/db";
import type { ObjectStore } from "@clankeroverflow/kb";

function userId(ctx: {
  session: { user: { id: string } } | null;
  apiKey: { referenceId: string } | null;
}) {
  return ctx.session?.user.id ?? ctx.apiKey?.referenceId ?? null;
}

function requireUser(ctx: {
  session: { user: { id: string } } | null;
  apiKey: { referenceId: string } | null;
}) {
  const id = userId(ctx);
  if (!id) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "A signed-in user or team API key is required.",
    });
  }
  return id;
}

function isDatabase(value: unknown): value is Database {
  if (!value || typeof value !== "object") return false;
  const db = value as Database;
  return typeof db.insert === "function" && typeof db.select === "function";
}

async function loadTeam(ctx: {
  session: { user: { id: string } } | null;
  apiKey: { referenceId: string } | null;
  kb?: TeamKnowledge;
  db?: Database;
  teamRepository?: TeamRepository;
  objectStore?: ObjectStore;
}) {
  if (ctx.kb) return { team: ctx.kb, created: false, commit: async () => {} };
  const teamId = requireUser(ctx);
  const repository =
    ctx.teamRepository ?? (isDatabase(ctx.db) ? new DrizzleTeamRepository(ctx.db) : undefined);
  if (!repository) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Team storage is not configured.",
    });
  }
  return openTeamSession({
    repository,
    objectStore: ctx.objectStore,
    teamId,
  });
}

const layerNote =
  "Hosted tools see the team knowledge base only. Personal and repo files stay on the machine.";

export const kbRouter = router({
  search: publicProcedure
    .input(
      z.object({
        query: z.string().trim().min(1),
        limit: z.number().int().min(1).max(20).default(5),
        area: z.string().optional(),
        tags: z.array(z.string()).optional(),
        type: z.enum(["fix", "howto", "decision", "gotcha", "reference"]).optional(),
        status: z.enum(["draft", "verified", "stale", "superseded"]).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { team, created, commit } = await loadTeam(ctx);
      if (created) await commit();
      const hits = team.search(input.query, {
        limit: input.limit,
        filters: {
          area: input.area,
          tags: input.tags,
          type: input.type,
          status: input.status,
        },
      });
      return hits.map((hit) => ({
        id: hit.id,
        problem: hit.title,
        solution: hit.snippet,
        tags: hit.path,
        score: hit.score,
        path: hit.path,
        status: hit.status,
        layer: "team" as const,
      }));
    }),
  browse: publicProcedure
    .input(z.object({ area: z.string().optional() }).default({}))
    .query(async ({ ctx, input }) => {
      const { team, created, commit } = await loadTeam(ctx);
      if (created) await commit();
      return team.browse(input.area);
    }),
  read: publicProcedure
    .input(z.object({ path: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const { team, created, commit } = await loadTeam(ctx);
      if (created) await commit();
      const doc = team.read(input.path);
      if (!doc) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });
      }
      return { path: doc.path, rev: doc.rev, markdown: doc.markdown };
    }),
  write: publicProcedure
    .input(
      z.object({
        title: z.string().trim().min(1),
        problem: z.string().trim().min(1),
        solution: z.string().trim().min(1),
        tags: z.array(z.string()).default([]),
        path: z.string().optional(),
        baseRev: z.number().int().nullable().default(null),
        force: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const loaded = await loadTeam(ctx);
      const author = requireUser(ctx);
      const path =
        input.path ??
        `general/${input.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .slice(0, 60)}.md`;
      const result = await loaded.team.write({
        path,
        baseRev: input.baseRev,
        source: "api",
        author,
        force: input.force,
        markdown: formatFixDocument({
          kind: "fix",
          id: path,
          path,
          title: input.title,
          type: "fix",
          area: path.split("/")[0] || "general",
          tags: input.tags,
          aliases: [],
          errorSignatures: [],
          status: "draft",
          confirmations: 0,
          created: new Date().toISOString().slice(0, 10),
          updated: new Date().toISOString().slice(0, 10),
          problem: input.problem,
          rootCause: "",
          solution: input.solution,
          verification: "",
          notes: "",
          authors: [author],
        }),
      });
      if (result.status === "conflict") {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Document changed at revision ${result.currentRev}. Merge and retry.`,
        });
      }
      if (result.status === "possible_duplicate") {
        return {
          id: result.docId,
          status: result.status,
          path: result.path,
          warning: "Possible duplicate.",
        };
      }
      await loaded.commit();
      return { id: result.docId, status: result.status, path: result.path, rev: result.rev };
    }),
  append: publicProcedure
    .input(
      z.object({ path: z.string().min(1), text: z.string().min(1), source: z.string().optional() }),
    )
    .mutation(async ({ ctx, input }) => {
      const { team, commit } = await loadTeam(ctx);
      const existing = team.read(input.path);
      const line = formatNoteEntry({
        text: input.text,
        metadata: {
          source: input.source ?? requireUser(ctx),
          added: new Date().toISOString().slice(0, 10),
        },
      });
      const markdown = existing
        ? `${existing.markdown.replace(/\s*$/, "")}\n${line}\n`
        : `# Notes\n\n${line}\n`;
      const result = await team.write({
        path: input.path,
        markdown,
        baseRev: existing?.rev ?? null,
        source: "api",
        author: requireUser(ctx),
        force: true,
        op: "append",
      });
      await commit();
      return { path: input.path, status: result.status };
    }),
  confirm: publicProcedure
    .input(z.object({ path: z.string().min(1), worked: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { team, commit } = await loadTeam(ctx);
      const result = await team.confirm(input.path, input.worked, requireUser(ctx));
      if (result.status !== "written") {
        throw new TRPCError({ code: "CONFLICT", message: "Could not confirm the document." });
      }
      await commit();
      return { path: result.path, rev: result.rev };
    }),
  lint: publicProcedure.query(async ({ ctx }) => {
    const { team, created, commit } = await loadTeam(ctx);
    if (created) await commit();
    return lintDocuments(team.listDocuments());
  }),
  changes: publicProcedure
    .input(z.object({ since: z.number().int().default(0) }))
    .query(async ({ ctx, input }) => {
      const { team, created, commit } = await loadTeam(ctx);
      if (created) await commit();
      return team.changesSince(input.since);
    }),
  history: publicProcedure
    .input(z.object({ path: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const { team, created, commit } = await loadTeam(ctx);
      if (created) await commit();
      return team.history(input.path);
    }),
  log: publicProcedure.query(async ({ ctx }) => {
    const { team, created, commit } = await loadTeam(ctx);
    if (created) await commit();
    return team.log();
  }),
  dream: publicProcedure
    .input(z.object({ tokenBudget: z.number().int().min(1).max(20_000).default(4000) }))
    .mutation(async ({ ctx, input }) => {
      const { team, commit } = await loadTeam(ctx);
      const dreamed = await team.runDream(input.tokenBudget);
      await commit();
      return dreamed;
    }),
  githubInbound: publicProcedure
    .input(
      z.object({
        files: z.array(
          z.object({
            path: z.string(),
            markdown: z.string(),
            commitMessage: z.string(),
            previousSyncedRev: z.number().int().nullable(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { team, commit } = await loadTeam(ctx);
      const applied = await team.applyGithubInbound(input.files);
      await commit();
      return applied;
    }),
  reconcile: publicProcedure.mutation(async ({ ctx }) => {
    const { team, commit } = await loadTeam(ctx);
    const report = await team.reconcile();
    await commit();
    return report;
  }),
  note: publicProcedure.query(() => layerNote),
});
