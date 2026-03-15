import { sql, relations } from "drizzle-orm";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

export const apiKey = sqliteTable(
  "api_key",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull().unique(),
    keyPrefix: text("key_prefix"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index("apiKey_userId_idx").on(table.userId),
    index("apiKey_key_idx").on(table.key),
  ]
);

export const apiKeyRelations = relations(apiKey, ({ one }) => ({
  user: one(user, {
    fields: [apiKey.userId],
    references: [user.id],
  }),
}));
