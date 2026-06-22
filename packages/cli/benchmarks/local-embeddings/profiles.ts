import type { BenchmarkDocument, ModelKey, ProfileKey } from "./types";
import { solutionEmbeddingText } from "../../src/mcp/local-semantic";

export const QWEN_QUERY_INSTRUCTION =
  "Given a technical debugging query, retrieve relevant reusable problem-and-solution entries that help resolve it";

export function formatDocument(model: ModelKey, profile: ProfileKey, document: BenchmarkDocument) {
  const text = solutionEmbeddingText(document);
  if (profile === "native" && model === "nomic") return `search_document: ${text}`;
  return text;
}

export function formatQuery(model: ModelKey, profile: ProfileKey, query: string) {
  const text = query.trim();
  if (profile === "raw" || model === "bge" || model === "granite") return text;
  if (model === "nomic") return `search_query: ${text}`;
  return `Instruct: ${QWEN_QUERY_INSTRUCTION}\nQuery:${text}`;
}
