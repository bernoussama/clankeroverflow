import { relations } from "drizzle-orm";
import { pgTable, text, index, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const apiKey = pgTable(
  "api_key",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull().unique(),
    keyPreview: text("key_preview").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name"), // Optional name like "Agent Token"
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
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
