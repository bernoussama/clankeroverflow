import { z } from "zod";

const dateLikeSchema = z.union([z.string(), z.date()]);

export const searchResultSchema = z.object({
  id: z.string(),
  problem: z.string(),
  solution: z.string(),
  tags: z.string().nullable(),
  userId: z.string().nullable(),
  score: z.number(),
  createdAt: dateLikeSchema,
  updatedAt: dateLikeSchema,
});

export const searchResultsSchema = z.array(searchResultSchema);
export const solutionDetailsSchema = searchResultSchema;

export const apiKeySchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string().nullable(),
  createdAt: dateLikeSchema,
});

export const apiKeysSchema = z.array(apiKeySchema);

export type SearchResult = z.infer<typeof searchResultSchema>;
export type SearchResults = z.infer<typeof searchResultsSchema>;
export type SolutionDetails = z.infer<typeof solutionDetailsSchema>;
export type ApiKey = z.infer<typeof apiKeySchema>;
export type ApiKeys = z.infer<typeof apiKeysSchema>;
