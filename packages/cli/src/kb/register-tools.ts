import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { KnowledgeBase } from "./knowledge-base";
import type { KbLayer } from "./types";

const layerSchema = z.enum(["personal", "repo", "team"]).default("repo");

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

export function registerKnowledgeBaseTools(
  server: McpServer,
  knowledgeBase = KnowledgeBase.open(),
) {
  server.registerTool(
    "kb_search",
    {
      description:
        "Search the markdown knowledge base. Results are labeled personal, repo, or team. Repo hits rank first when scores are close. Drafts are included and marked.",
      inputSchema: z.object({
        query: z.string().trim().min(1),
        limit: z.number().int().min(1).max(20).default(5),
        area: z.string().optional(),
        tags: z.array(z.string()).optional(),
        type: z.enum(["fix", "howto", "decision", "gotcha", "reference"]).optional(),
        status: z.enum(["draft", "verified", "stale", "superseded"]).optional(),
      }),
    },
    async ({ query, limit, area, tags, type, status }) => {
      const hits = knowledgeBase.search(query, { limit, filters: { area, tags, type, status } });
      if (!hits.length) return text("No matching knowledge base documents.");
      return text(
        hits
          .map(
            (hit, index) =>
              `${index + 1}. [${hit.layer}] ${hit.title} (${hit.path})\nstatus: ${hit.status ?? "note"}\n${hit.snippet}`,
          )
          .join("\n\n"),
      );
    },
  );

  server.registerTool(
    "kb_browse",
    {
      description: "Return the generated catalog for the knowledge base, or for one area.",
      inputSchema: z.object({ area: z.string().optional() }),
    },
    async ({ area }) => text(knowledgeBase.browse(area)),
  );

  server.registerTool(
    "kb_read",
    {
      description: "Read one knowledge base document by path or id.",
      inputSchema: z.object({
        path: z.string().optional(),
        id: z.string().optional(),
        layer: layerSchema.optional(),
      }),
    },
    async ({ path, id, layer }) => {
      if (!path && !id) throw new Error("Provide path or id.");
      const loaded = path
        ? knowledgeBase.read(path, layer)
        : knowledgeBase
            .search(id!, { limit: 20 })
            .map((hit) => knowledgeBase.read(hit.path, hit.layer))
            .find((candidate) => candidate?.document.id === id);
      if (!loaded) return text(`No document found for ${path ?? id}.`);
      return text(
        loaded.document.kind === "note"
          ? loaded.document.body
          : [
              `# ${loaded.document.title}`,
              `status: ${loaded.document.status}`,
              "",
              loaded.document.problem,
              "",
              loaded.document.solution,
            ].join("\n"),
      );
    },
  );

  server.registerTool(
    "kb_write",
    {
      description:
        "Write a structured fix document. Refuses to create a duplicate until mode is update or force is true. New documents are drafts.",
      inputSchema: z.object({
        layer: layerSchema,
        title: z.string().trim().min(1),
        problem: z.string().trim().min(1),
        solution: z.string().trim().min(1),
        root_cause: z.string().optional(),
        verification: z.string().optional(),
        tags: z.array(z.string()).default([]),
        area: z.string().optional(),
        path: z.string().optional(),
        mode: z.enum(["create", "update"]).default("create"),
        force: z.boolean().default(false),
      }),
    },
    async (input) => {
      const result = knowledgeBase.writeFix(
        input.layer,
        {
          title: input.title,
          problem: input.problem,
          solution: input.solution,
          rootCause: input.root_cause,
          verification: input.verification,
          tags: input.tags,
          area: input.area,
          path: input.mode === "update" ? input.path : undefined,
          status: "draft",
        },
        { dedupe: input.mode === "create" && !input.force },
      );
      if (result.status === "possible_duplicate") {
        return text(
          `Possible duplicate: ${result.document.path}. Pass force or mode update to write anyway.`,
        );
      }
      return text(
        [`Wrote draft ${result.document.path}`, ...result.warnings].filter(Boolean).join("\n"),
      );
    },
  );

  server.registerTool(
    "kb_append",
    {
      description:
        "Append one note line. Two writers can add different lines without rewriting the file.",
      inputSchema: z.object({
        layer: layerSchema,
        path: z.string().trim().min(1),
        text: z.string().trim().min(1),
        source: z.string().optional(),
        added: z.string().optional(),
      }),
    },
    async ({ layer, path, text: entry, source, added }) => {
      const metadata: Record<string, string> = {};
      if (source) metadata.source = source;
      metadata.added = added || new Date().toISOString().slice(0, 10);
      const loaded = knowledgeBase.append(layer, path, { text: entry, metadata });
      return text(`Appended to ${loaded.document.path}`);
    },
  );

  server.registerTool(
    "kb_confirm",
    {
      description:
        "Record that a fix worked or failed. The first success promotes a draft to verified.",
      inputSchema: z.object({
        layer: layerSchema,
        path: z.string().trim().min(1),
        worked: z.boolean(),
        note: z.string().optional(),
      }),
    },
    async ({ layer, path, worked, note }) => {
      const document = knowledgeBase.confirm(layer, path, worked);
      return text(
        [`${document.path} is ${document.status} (${document.confirmations} confirmations)`, note]
          .filter(Boolean)
          .join("\n"),
      );
    },
  );
}

export type { KbLayer };
