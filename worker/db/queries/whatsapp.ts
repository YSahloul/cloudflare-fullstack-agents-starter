import { and, desc, eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../schema";

export async function getWhatsAppSessionById(db: DrizzleD1Database<typeof schema>, id: string) {
  const [session] = await db
    .select()
    .from(schema.whatsappSessions)
    .where(eq(schema.whatsappSessions.id, id));
  return session ?? null;
}

export async function getWhatsAppSessionByGatewaySessionId(
  db: DrizzleD1Database<typeof schema>,
  gatewaySessionId: string,
) {
  const [session] = await db
    .select()
    .from(schema.whatsappSessions)
    .where(eq(schema.whatsappSessions.gatewaySessionId, gatewaySessionId));
  return session ?? null;
}

export async function getWhatsAppSessionByDisplayNameAndUserId(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  displayName: string,
) {
  const [session] = await db
    .select()
    .from(schema.whatsappSessions)
    .where(
      and(
        eq(schema.whatsappSessions.userId, userId),
        eq(schema.whatsappSessions.displayName, displayName),
      ),
    )
    .orderBy(desc(schema.whatsappSessions.createdAt));

  return session ?? null;
}

export async function listWhatsAppSessionsByUserId(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
) {
  return db
    .select()
    .from(schema.whatsappSessions)
    .where(eq(schema.whatsappSessions.userId, userId))
    .orderBy(desc(schema.whatsappSessions.createdAt));
}

export async function createWhatsAppSession(
  db: DrizzleD1Database<typeof schema>,
  data: Omit<schema.WhatsAppSessionInsert, "createdAt" | "updatedAt">,
) {
  const [session] = await db.insert(schema.whatsappSessions).values(data).returning();
  return session;
}

export async function updateWhatsAppSession(
  db: DrizzleD1Database<typeof schema>,
  id: string,
  data: Partial<
    Omit<
      schema.WhatsAppSessionInsert,
      "id" | "gatewaySessionId" | "userId" | "createdAt" | "updatedAt"
    >
  >,
) {
  const [session] = await db
    .update(schema.whatsappSessions)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.whatsappSessions.id, id))
    .returning();
  return session;
}

export async function updateWhatsAppSessionByGatewaySessionId(
  db: DrizzleD1Database<typeof schema>,
  gatewaySessionId: string,
  data: Partial<
    Omit<
      schema.WhatsAppSessionInsert,
      "id" | "gatewaySessionId" | "userId" | "createdAt" | "updatedAt"
    >
  >,
) {
  const [session] = await db
    .update(schema.whatsappSessions)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.whatsappSessions.gatewaySessionId, gatewaySessionId))
    .returning();
  return session;
}

export async function deleteWhatsAppSession(db: DrizzleD1Database<typeof schema>, id: string) {
  await db.delete(schema.whatsappSessions).where(eq(schema.whatsappSessions.id, id));
  return { ok: true as const };
}

export async function resolveWhatsAppRuntimeConfigByGatewaySessionId(
  db: DrizzleD1Database<typeof schema>,
  gatewaySessionId: string,
) {
  const session = await getWhatsAppSessionByGatewaySessionId(db, gatewaySessionId);
  if (!session || !session.autoReply) {
    return null;
  }

  return {
    session,
    systemPrompt: session.systemPrompt ?? "You are a helpful assistant.",
    model: session.model ?? "gpt-4.1-mini",
    temperature: session.temperature ?? 20,
    maxTokens: session.maxTokens ?? 900,
    groupPolicy: session.groupPolicy ?? "mention",
    dmPolicy: session.dmPolicy ?? "always",
  };
}
