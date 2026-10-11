import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const team = pgTable("team", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const teamMember = pgTable(
  "team_member",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.teamId, table.userId] }),
    index("team_member_user_idx").on(table.userId),
  ],
);

export const teamKb = pgTable("team_kb", {
  teamId: text("team_id")
    .primaryKey()
    .references(() => team.id, { onDelete: "cascade" }),
  r2Prefix: text("r2_prefix").notNull(),
  jurisdiction: text("jurisdiction").notNull().default("default"),
  reviewPolicy: text("review_policy").notNull().default("auto"),
  githubRepo: text("github_repo"),
  githubSyncMode: text("github_sync_mode").notNull().default("off"),
  dreamCursor: integer("dream_cursor").notNull().default(0),
  dreamSpentTokens: integer("dream_spent_tokens").notNull().default(0),
});

export const kbDocument = pgTable(
  "kb_document",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    docId: text("doc_id").notNull(),
    path: text("path").notNull(),
    rev: integer("rev").notNull(),
    contentHash: text("content_hash").notNull(),
    frontmatter: jsonb("frontmatter").notNull(),
    body: text("body").notNull(),
    markdown: text("markdown").notNull(),
    deleted: boolean("deleted").notNull().default(false),
    searchable: boolean("searchable").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.teamId, table.docId] }),
    uniqueIndex("kb_document_team_path_idx").on(table.teamId, table.path),
  ],
);

export const kbChange = pgTable(
  "kb_change",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    docId: text("doc_id").notNull(),
    path: text("path").notNull(),
    rev: integer("rev").notNull(),
    op: text("op").notNull(),
    source: text("source").notNull(),
    externalRef: text("external_ref"),
    author: text("author"),
    agent: text("agent"),
    session: text("session"),
    message: text("message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.teamId, table.seq] }),
    index("kb_change_team_doc_idx").on(table.teamId, table.docId),
  ],
);

export const teamRelations = relations(team, ({ many, one }) => ({
  members: many(teamMember),
  kb: one(teamKb, { fields: [team.id], references: [teamKb.teamId] }),
  documents: many(kbDocument),
}));

export const teamMemberRelations = relations(teamMember, ({ one }) => ({
  team: one(team, { fields: [teamMember.teamId], references: [team.id] }),
  user: one(user, { fields: [teamMember.userId], references: [user.id] }),
}));

export const userTeamRelations = relations(user, ({ many }) => ({
  teams: many(teamMember),
}));
