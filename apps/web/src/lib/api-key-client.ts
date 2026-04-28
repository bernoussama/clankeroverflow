import { z } from "zod";

const dateLikeSchema = z.union([z.string(), z.date()]);

export const apiKeyListItemSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  start: z.string().nullable(),
  prefix: z.string().nullable(),
  createdAt: dateLikeSchema,
});

export const listApiKeysResultSchema = z.object({
  apiKeys: z.array(apiKeyListItemSchema),
  total: z.number(),
  limit: z.number().optional(),
  offset: z.number().optional(),
});

export const createdApiKeySchema = apiKeyListItemSchema.extend({
  key: z.string(),
});

export type ApiKeyListItem = z.infer<typeof apiKeyListItemSchema>;
export type CreatedApiKey = z.infer<typeof createdApiKeySchema>;

export function formatApiKeyPreview(apiKey: Pick<ApiKeyListItem, "prefix" | "start">) {
  if (apiKey.start) {
    return `${apiKey.start}...`;
  }

  if (apiKey.prefix) {
    return `${apiKey.prefix}...`;
  }

  return "Hidden";
}
