import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { protectedProcedure, router } from "../index";
import { db, schema } from "@clankeroverflow/db";
import { hashApiKey } from "../hash";

export const apiKeysRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const keys = await db.query.apiKey.findMany({
      where: eq(schema.apiKey.userId, ctx.session.user.id),
      orderBy: (fields, { desc }) => [desc(fields.createdAt)],
      columns: {
        id: true,
        keyPrefix: true,
        name: true,
        createdAt: true,
      },
    });
    return keys;
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "Name is required").max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const id = crypto.randomUUID();
      const rawKey = `clk_${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`;
      const keyHash = await hashApiKey(rawKey);
      const keyPrefix = rawKey.substring(0, 12);

      await db.insert(schema.apiKey).values({
        id,
        key: keyHash,
        keyPrefix,
        name: input.name,
        userId: ctx.session.user.id,
      });

      return { id, key: rawKey, name: input.name };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
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
