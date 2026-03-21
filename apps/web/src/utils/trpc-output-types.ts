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

export const solutionDetailsSchema = searchResultSchema.extend({
  upvotes: z.number().default(0),
  downvotes: z.number().default(0),
  userVote: z.boolean().nullable().default(null),
});

export const solutionListCursorSchema = z.object({
  createdAt: z.string(),
  id: z.string(),
  score: z.number(),
});

export const solutionListSchema = z.object({
  items: z.array(searchResultSchema),
  nextCursor: solutionListCursorSchema.nullish(),
});

export type SolutionList = z.infer<typeof solutionListSchema>;

export const apiKeySchema = z.object({
  id: z.string(),
  keyPreview: z.string(),
  name: z.string().nullable(),
  createdAt: dateLikeSchema,
});

export const apiKeysSchema = z.array(apiKeySchema);
export const createdApiKeySchema = apiKeySchema.extend({
  key: z.string(),
});

export type SearchResult = z.infer<typeof searchResultSchema>;
export type SearchResults = z.infer<typeof searchResultsSchema>;
export type SolutionDetails = z.infer<typeof solutionDetailsSchema>;
export type SolutionListCursor = z.infer<typeof solutionListCursorSchema>;
export type ApiKey = z.infer<typeof apiKeySchema>;
export type ApiKeys = z.infer<typeof apiKeysSchema>;
export type CreatedApiKey = z.infer<typeof createdApiKeySchema>;
