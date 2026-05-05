import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";

export * from "./auth-schema";

import { user as usersTable } from "./auth-schema";

export type UserSelect = typeof usersTable.$inferSelect;

/**
 * Personal agents table that associates a created agent with a user
 */
export const personalAgents = sqliteTable("personal_agents", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid())
    .unique()
    .notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  agentName: text("agent_name").notNull(),
  systemPrompt: text("system_prompt"),
  model: text("model").default("gpt-4.1-mini"),
  temperature: integer("temperature").default(20),
  maxTokens: integer("max_tokens").default(900),
  archived: integer({ mode: "boolean" }).default(false).notNull(),
  createdAt: integer({ mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer({ mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export type PersonalAgentSelect = typeof personalAgents.$inferSelect;
export type PersonalAgentInsert = typeof personalAgents.$inferInsert;

export const whatsappSessions = sqliteTable("whatsapp_sessions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid())
    .notNull(),
  gatewaySessionId: text("gateway_session_id")
    .notNull()
    .$defaultFn(() => `wa_${nanoid()}`)
    .unique(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  status: text("status", { length: 20 }).notNull().default("disconnected"),
  agentId: text("agent_id").references(() => personalAgents.id, { onDelete: "set null" }),
  // AI config stored directly on the session
  systemPrompt: text("system_prompt"),
  model: text("model").default("gpt-4.1-mini"),
  temperature: integer("temperature").default(20),
  maxTokens: integer("max_tokens").default(900),
  groupPolicy: text("group_policy", { length: 20 }).default("mention"),
  dmPolicy: text("dm_policy", { length: 20 }).default("always"),
  autoReply: integer("auto_reply", { mode: "boolean" }).default(true),
  webhookUrl: text("webhook_url"),
  createdAt: integer({ mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer({ mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export type WhatsAppSessionSelect = typeof whatsappSessions.$inferSelect;
export type WhatsAppSessionInsert = typeof whatsappSessions.$inferInsert;
