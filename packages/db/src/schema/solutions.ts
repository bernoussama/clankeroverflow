import { sql, relations } from "drizzle-orm";
import { sqliteTable, text, integer, index, primaryKey } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

export const solution = sqliteTable(
  "solution",
  {
    id: text("id").primaryKey(),
    problem: text("problem").notNull(),
    solution: text("solution").notNull(),
    tags: text("tags"), // Stored as comma-separated or JSON string
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }), // Nullable for anonymous
    score: integer("score").default(0).notNull(),
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

export const solutionVote = sqliteTable(
  "solution_vote",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    solutionId: text("solution_id")
      .notNull()
      .references(() => solution.id, { onDelete: "cascade" }),
    isUpvote: integer("is_upvote", { mode: "boolean" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.solutionId] }),
    index("solutionVote_solutionId_idx").on(table.solutionId),
  ]
);

export const solutionRelations = relations(solution, ({ one, many }) => ({
  user: one(user, {
    fields: [solution.userId],
    references: [user.id],
  }),
  votes: many(solutionVote),
}));

export const solutionVoteRelations = relations(solutionVote, ({ one }) => ({
  user: one(user, {
    fields: [solutionVote.userId],
    references: [user.id],
  }),
  solution: one(solution, {
    fields: [solutionVote.solutionId],
    references: [solution.id],
  }),
}));
