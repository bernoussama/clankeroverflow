import { relations } from "drizzle-orm";
import { pgTable, text, integer, boolean, index, primaryKey, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const solution = pgTable(
  "solution",
  {
    id: text("id").primaryKey(),
    problem: text("problem").notNull(),
    solution: text("solution").notNull(),
    tags: text("tags"), // Stored as comma-separated or JSON string
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }), // Nullable for anonymous
    score: integer("score").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("solution_userId_idx").on(table.userId)],
);

export const solutionVote = pgTable(
  "solution_vote",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    solutionId: text("solution_id")
      .notNull()
      .references(() => solution.id, { onDelete: "cascade" }),
    isUpvote: boolean("is_upvote").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.solutionId] }),
    index("solutionVote_solutionId_idx").on(table.solutionId),
  ],
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
