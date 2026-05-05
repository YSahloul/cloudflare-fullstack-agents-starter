import { and, desc, eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { nanoid } from "nanoid";
import * as schema from "../schema";

export async function getPersonalAgentById(db: DrizzleD1Database<typeof schema>, id: string) {
  const [personalAgent] = await db
    .select()
    .from(schema.personalAgents)
    .where(eq(schema.personalAgents.id, id));

  return personalAgent;
}

export async function createPersonalAgent(
  db: DrizzleD1Database<typeof schema>,
  data: {
    userId: string;
    agentName: string;
    systemPrompt?: string | null;
    model?: string | null;
    temperature?: number | null;
    maxTokens?: number | null;
  },
) {
  const id = nanoid();
  const [personalAgent] = await db
    .insert(schema.personalAgents)
    .values({
      id,
      userId: data.userId,
      agentName: data.agentName,
      systemPrompt: data.systemPrompt,
      model: data.model,
      temperature: data.temperature,
      maxTokens: data.maxTokens,
    })
    .returning();

  return personalAgent;
}

export async function listPersonalAgentsByUserId(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
) {
  const personalAgents = await db
    .select()
    .from(schema.personalAgents)
    .where(and(eq(schema.personalAgents.userId, userId), eq(schema.personalAgents.archived, false)))
    .orderBy(desc(schema.personalAgents.createdAt));

  return personalAgents;
}

export async function updatePersonalAgent(
  db: DrizzleD1Database<typeof schema>,
  id: string,
  data: {
    agentName?: string;
    systemPrompt?: string | null;
    model?: string | null;
    temperature?: number | null;
    maxTokens?: number | null;
  },
) {
  const [personalAgent] = await db
    .update(schema.personalAgents)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.personalAgents.id, id))
    .returning();

  return personalAgent;
}

export async function archivePersonalAgent(db: DrizzleD1Database<typeof schema>, id: string) {
  const [personalAgent] = await db
    .update(schema.personalAgents)
    .set({ archived: true, updatedAt: new Date() })
    .where(eq(schema.personalAgents.id, id))
    .returning();

  return personalAgent;
}
