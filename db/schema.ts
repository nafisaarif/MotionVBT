import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sprintSessions = sqliteTable("sprint_sessions", {
  code: text("code").primaryKey(),
  distance: integer("distance").notNull(),
  athlete: text("athlete").notNull(),
  status: text("status").notNull().default("waiting"),
  finishConnected: integer("finish_connected", { mode: "boolean" }).notNull().default(false),
  startAt: integer("start_at"),
  finishAt: integer("finish_at"),
  createdAt: integer("created_at").notNull(),
});
