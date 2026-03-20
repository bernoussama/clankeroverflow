import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { protectedProcedure, router } from "../index";
import { schema } from "@clankeroverflow/db";

export const apiKeysRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = ctx.db;
    return await db.query.apiKey.findMany({
      where: eq(schema.apiKey.userId, ctx.session.user.id),
      orderBy: (fields, { desc }) => [desc(fields.createdAt)],
    });
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "Name is required").max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const id = crypto.randomUUID();
      // Generate a simple prefix + random token for the API key using web crypto
      const key = `clk_${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`;

      const [createdApiKey] = await db
        .insert(schema.apiKey)
        .values({
          id,
          key,
          name: input.name,
          userId: ctx.session.user.id,
        })
        .returning({
          id: schema.apiKey.id,
          key: schema.apiKey.key,
          name: schema.apiKey.name,
          createdAt: schema.apiKey.createdAt,
        });

      if (!createdApiKey) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create API key",
        });
      }

      return createdApiKey;
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
