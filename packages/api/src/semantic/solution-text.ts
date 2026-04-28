/**
 * Text passed to the embedding model for a solution row.
 * Keeps tags and structure so code-adjacent context stays aligned with search queries.
 */
export function solutionEmbeddingText(input: {
  problem: string;
  solution: string;
  tags: string | null | undefined;
}): string {
  const tags = input.tags?.trim();
  const header = tags ? `Tags: ${tags}\n\n` : "";
  return `${header}Problem:\n${input.problem.trim()}\n\nSolution:\n${input.solution.trim()}`;
}
