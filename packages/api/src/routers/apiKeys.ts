import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createApiKeyValue } from "@clankeroverflow/auth/api-keys";

import { protectedProcedure, router } from "../index";
import { schema } from "@clankeroverflow/db";

export const apiKeysRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = ctx.db;
    const apiKeys = await db.query.apiKey.findMany({
      where: eq(schema.apiKey.userId, ctx.session.user.id),
      orderBy: (fields, { desc }) => [desc(fields.createdAt)],
    });

    return apiKeys.map(({ createdAt, id, keyPreview, name }) => ({
      createdAt,
      id,
      keyPreview,
      name,
    }));
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1, "Name is required").max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const id = crypto.randomUUID();
      const { key, keyHash, keyPreview } = await createApiKeyValue();

      const [createdApiKey] = await db
        .insert(schema.apiKey)
        .values({
          id,
          key: keyHash,
          keyPreview,
          name: input.name,
          userId: ctx.session.user.id,
        })
        .returning({
          id: schema.apiKey.id,
          name: schema.apiKey.name,
          createdAt: schema.apiKey.createdAt,
        });

      if (!createdApiKey) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create API key",
        });
      }

      return {
        ...createdApiKey,
        key,
        keyPreview,
      };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      // Ensure the key belongs to the current user
      const keyRecord = await db.query.apiKey.findFirst({
        where: eq(schema.apiKey.id, input.id),
      });

      if (!keyRecord || keyRecord.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "API Key not found",
        });
      }

      await db.delete(schema.apiKey).where(eq(schema.apiKey.id, input.id));
      
      return { success: true };
    }),
});
