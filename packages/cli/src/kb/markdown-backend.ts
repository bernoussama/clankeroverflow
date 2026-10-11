import type {
  LogSolutionInput,
  SearchSolutionsInput,
  SolutionBackend,
  SolutionResult,
  VoteSolutionInput,
} from "../mcp/backend";
import { KnowledgeBase, fixFromHit } from "./knowledge-base";
import type { KbLayer } from "./types";

export class MarkdownBackend implements SolutionBackend {
  constructor(
    private readonly knowledgeBase: KnowledgeBase,
    private readonly layer: KbLayer = "repo",
  ) {}

  async log(input: LogSolutionInput) {
    const tags = (input.tags ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const result = this.knowledgeBase.writeFix(
      this.layer,
      {
        title: input.problem,
        problem: input.problem,
        solution: input.solution,
        tags,
        rootCause: "See the verified fix.",
        verification: "Logged from ClankerOverflow.",
      },
      { dedupe: true },
    );
    if (result.status === "possible_duplicate" && result.document.kind === "fix") {
      return {
        id: result.document.id,
        warning: "Matched an existing document. Nothing new was written.",
      };
    }
    if (result.status !== "written") {
      return { id: result.document.id };
    }
    return {
      id: result.document.id,
      warning: result.warnings.length ? result.warnings.join(" ") : undefined,
    };
  }

  async search(input: SearchSolutionsInput): Promise<SolutionResult[]> {
    return this.knowledgeBase.search(input.query, { limit: input.limit }).flatMap((hit) => {
      const loaded = this.knowledgeBase.read(hit.path, hit.layer);
      if (!loaded || loaded.document.kind !== "fix") return [];
      return [{ ...fixFromHit(loaded.document), score: hit.score }];
    });
  }

  async vote(input: VoteSolutionInput) {
    const docs = this.knowledgeBase.search(input.id, { limit: 20 });
    const match = docs.find((hit) => hit.id === input.id) ?? this.findById(input.id);
    if (!match) throw new Error(`No knowledge base document with id ${input.id}.`);
    this.knowledgeBase.confirm(match.layer, match.path, input.isUpvote);
  }

  close() {}

  private findById(id: string) {
    for (const layer of ["repo", "team", "personal"] as const) {
      try {
        const store = this.knowledgeBase.storeFor(layer);
        const found = store.list().find((loaded) => loaded.document.id === id);
        if (found) return { layer, path: found.document.path };
      } catch {
        // That layer is not configured.
      }
    }
    return undefined;
  }
}
