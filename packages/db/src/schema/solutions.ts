import { sql, relations } from "drizzle-orm";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

export const solution = sqliteTable(
  "solution",
  {
    id: text("id").primaryKey(),
    problem: text("problem").notNull(),
    solution: text("solution").notNull(),
    tags: text("tags"), // Stored as comma-separated or JSON string
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }), // Nullable for anonymous
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("solution_userId_idx").on(table.userId),
  ]
);

export const solutionRelations = relations(solution, ({ one }) => ({
  user: one(user, {
    fields: [solution.userId],
    references: [user.id],
  }),
}));
