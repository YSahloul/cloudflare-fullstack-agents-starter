import { getLogger } from "@logtape/logtape";
import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { nanoid } from "nanoid";
import { LOGGER_NAME } from "../constants";
import { getPersonalAgentById } from "../db/queries/personal-agents";
import * as db from "../db/queries/whatsapp";
import * as schema from "../db/schema";
import { dbProvider } from "../lib/dbProvider";
import type { HonoAppType } from "../types";
import type { WhatsAppBotProps } from "../whatsapp/agent";
import type { BaileysWebhook } from "../whatsapp/channels";
import { getWhatsAppThreadKey } from "../whatsapp/channels";
import * as gateway from "../whatsapp/gateway";

const logger = getLogger([LOGGER_NAME, "whatsapp-api"]);

interface CreateWhatsAppSessionBody {
  displayName?: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  groupPolicy?: string;
  dmPolicy?: string;
  autoReply?: boolean;
  agentId?: string | null;
}

interface UpdateWhatsAppSessionBody extends Partial<CreateWhatsAppSessionBody> {
  status?: string;
}

interface StatusWebhookPayload {
  status?: string;
}

interface GenericWebhook {
  event?: string;
  session?: string;
  payload?: unknown;
}

function sanitizeGatewayPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_");
}

function createGatewaySessionId(userId: string, sessionId: string): string {
  return `wa_${sanitizeGatewayPart(userId)}_${sanitizeGatewayPart(sessionId)}`;
}

function parseCreateBody(body: CreateWhatsAppSessionBody, userId: string) {
  const id = nanoid();
  const displayName = body.displayName?.trim() || "WhatsApp";

  return {
    id,
    gatewaySessionId: createGatewaySessionId(userId, id),
    userId,
    displayName,
    status: "stopped",
    systemPrompt: body.systemPrompt,
    model: body.model,
    temperature: body.temperature,
    maxTokens: body.maxTokens,
    groupPolicy: body.groupPolicy,
    dmPolicy: body.dmPolicy,
    autoReply: body.autoReply,
    agentId: body.agentId,
  };
}

function parseUpdateBody(body: UpdateWhatsAppSessionBody) {
  return {
    ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
    ...(body.status !== undefined ? { status: body.status } : {}),
    ...(body.systemPrompt !== undefined ? { systemPrompt: body.systemPrompt } : {}),
    ...(body.model !== undefined ? { model: body.model } : {}),
    ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
    ...(body.maxTokens !== undefined ? { maxTokens: body.maxTokens } : {}),
    ...(body.groupPolicy !== undefined ? { groupPolicy: body.groupPolicy } : {}),
    ...(body.dmPolicy !== undefined ? { dmPolicy: body.dmPolicy } : {}),
    ...(body.autoReply !== undefined ? { autoReply: body.autoReply } : {}),
    ...(body.agentId !== undefined ? { agentId: body.agentId } : {}),
  };
}

function getAppWebhookConfig(c: { req: { url: string }; env: { WHATSAPP_API_KEY?: string } }) {
  return {
    webhookUrl: `${new URL(c.req.url).origin}/api/whatsapp/webhook`,
    webhookApiKey: c.env.WHATSAPP_API_KEY,
  };
}

function getWebhookStatus(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const status = (payload as StatusWebhookPayload).status;
  return typeof status === "string" && status.trim() ? status : null;
}

function serializeSession(row: schema.WhatsAppSessionSelect) {
  return {
    ...row,
    linked: row.status === "connected",
    hasQr: row.status === "qr",
    pairingCode: null,
  };
}

async function getOwnedSessionBySlug(
  d1: DrizzleD1Database<typeof schema>,
  userId: string,
  slug: string,
) {
  return db.getWhatsAppSessionByDisplayNameAndUserId(d1, userId, slug);
}

async function ensureOwnedSessionBySlug(
  d1: DrizzleD1Database<typeof schema>,
  userId: string,
  slug: string,
) {
  const existing = await getOwnedSessionBySlug(d1, userId, slug);

  if (existing) {
    return existing;
  }

  return db.createWhatsAppSession(d1, parseCreateBody({ displayName: slug }, userId));
}

async function getPrimarySessionForUser(
  d1: DrizzleD1Database<typeof schema>,
  userId: string,
) {
  return db.getLatestWhatsAppSessionByUserId(d1, userId);
}

async function ensurePrimarySessionForUser(
  d1: DrizzleD1Database<typeof schema>,
  userId: string,
) {
  const existing = await getPrimarySessionForUser(d1, userId);

  if (existing) {
    return existing;
  }

  return db.createWhatsAppSession(d1, parseCreateBody({ displayName: "WhatsApp" }, userId));
}

export const whatsappRouter = new Hono<HonoAppType>()
  // ── Public webhook (no user auth; protected by X-Api-Key) ────────────────
  .post("/webhook", async (c) => {
    const apiKey = c.req.header("X-Api-Key");
    const expectedKey = c.env.WHATSAPP_API_KEY;
    if (!expectedKey || !apiKey || apiKey !== expectedKey) {
      return c.text("Unauthorized", 401);
    }

    let rawBody: GenericWebhook;
    try {
      rawBody = await c.req.json<GenericWebhook>();
    } catch {
      return c.text("Invalid JSON", 400);
    }

    if (typeof rawBody.session !== "string" || !rawBody.session.trim()) {
      return c.text("Missing session", 400);
    }

    const d1 = drizzle(c.env.DB, { schema });
    const gatewaySessionId = rawBody.session;

    logger.info("[WhatsApp] Webhook received", {
      event: rawBody.event,
      gatewaySessionId,
      hasPayload: rawBody.payload !== undefined,
    });

    if (rawBody.event === "session.status") {
      const status = getWebhookStatus(rawBody.payload);
      logger.info("[WhatsApp] Session status webhook", {
        gatewaySessionId,
        status,
      });

      if (status) {
        await db.updateWhatsAppSessionByGatewaySessionId(d1, gatewaySessionId, { status });
      }

      return c.text("OK", 200);
    }

    const messageBody = rawBody as BaileysWebhook;
    const session = await db.getWhatsAppSessionByGatewaySessionId(d1, gatewaySessionId);
    if (!session) {
      logger.warn("[WhatsApp] No session found for webhook", {
        gatewaySessionId,
        event: rawBody.event,
      });
      return c.text("OK", 200);
    }

    logger.info("[WhatsApp] Session resolved for webhook", {
      gatewaySessionId,
      sessionId: session.id,
      sessionStatus: session.status,
      sessionAgentId: session.agentId,
      autoReply: session.autoReply,
      groupPolicy: session.groupPolicy,
      dmPolicy: session.dmPolicy,
    });

    let chatThreadKey: string;
    try {
      chatThreadKey = getWhatsAppThreadKey(messageBody);
    } catch (error) {
      logger.debug("[WhatsApp] Webhook event has no conversation thread", {
        event: rawBody.event,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.text("OK", 200);
    }

    const assignedAgent = session.agentId ? await getPersonalAgentById(d1, session.agentId) : null;
    const agentBelongsToSessionOwner = assignedAgent?.userId === session.userId;
    const threadKey = `${gatewaySessionId}:${chatThreadKey}`;
    const origin = new URL(c.req.url).origin;

    logger.info("[WhatsApp] Conversation resolved", {
      gatewaySessionId,
      chatThreadKey,
      threadKey,
      assignedAgentId: assignedAgent?.id ?? null,
      assignedAgentName: assignedAgent?.agentName ?? null,
      agentBelongsToSessionOwner,
    });

    const props: WhatsAppBotProps = {
      sessionId: gatewaySessionId,
      agentId: agentBelongsToSessionOwner ? assignedAgent.id : null,
      agentName: agentBelongsToSessionOwner ? assignedAgent.agentName : "Unassigned WhatsApp Agent",
      systemPrompt: agentBelongsToSessionOwner
        ? (assignedAgent.systemPrompt ??
          "You are a research and fact-check agent. Verify claims with evidence, return a truth meter, and cite sources.")
        : "You are a research and fact-check agent. Verify claims with evidence, return a truth meter, and cite sources.",
      model: agentBelongsToSessionOwner ? (assignedAgent.model ?? "gpt-4.1-mini") : "gpt-4.1-mini",
      temperature: agentBelongsToSessionOwner ? (assignedAgent.temperature ?? 20) : 20,
      maxTokens: agentBelongsToSessionOwner ? (assignedAgent.maxTokens ?? 900) : 900,
      groupPolicy: session.groupPolicy as WhatsAppBotProps["groupPolicy"],
      dmPolicy: session.dmPolicy as WhatsAppBotProps["dmPolicy"],
      autoReply: agentBelongsToSessionOwner ? (session.autoReply ?? true) : false,
    };

    logger.info("[WhatsApp] DO props prepared", {
      threadKey,
      agentName: props.agentName,
      model: props.model,
      autoReply: props.autoReply,
      groupPolicy: props.groupPolicy,
      dmPolicy: props.dmPolicy,
      hasSystemPrompt: Boolean(props.systemPrompt?.trim()),
    });

    const doId = c.env.WhatsAppBotAgent.idFromName(threadKey);
    const stub = c.env.WhatsAppBotAgent.get(doId);

    const doReq = new Request(
      `${origin}/agents/whats-app-bot-agent/${encodeURIComponent(threadKey)}/message`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-partykit-props": JSON.stringify(props),
          "x-partykit-room": threadKey,
          "x-partykit-namespace": "whats-app-bot-agent",
        },
        body: JSON.stringify(messageBody),
      },
    );

    try {
      const start = Date.now();
      logger.info("[WhatsApp] Dispatching webhook to conversation DO", {
        threadKey,
        event: messageBody.event,
        from: messageBody.payload?.from,
        type: messageBody.payload?.type,
        isGroup: messageBody.payload?.isGroup,
        hasBody: typeof messageBody.payload?.body === "string" && messageBody.payload.body.trim().length > 0,
      });

      const response = await stub.fetch(doReq);

      logger.info("[WhatsApp] Conversation DO completed", {
        threadKey,
        status: response.status,
        durationMs: Date.now() - start,
      });

      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("[WhatsApp] DO error", {
        threadKey,
        error: message,
      });
      return c.json({ message: "DO error", error: message }, 500);
    }
  })

  // ── Sessions ─────────────────────────────────────────────────────────────
  .get("/sessions", dbProvider, async (c) => {
    const user = c.get("user");
    if (!user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const rows = await db.listWhatsAppSessionsByUserId(c.var.db, user.id);
    const data = rows.map(serializeSession);

    return c.json({ ok: true, data });
  })
  .post("/sessions", dbProvider, async (c) => {
    const user = c.get("user");
    if (!user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const body = await c.req.json<CreateWhatsAppSessionBody>();
    const row = await db.createWhatsAppSession(c.var.db, parseCreateBody(body, user.id));
    return c.json({ ok: true, data: row }, 201);
  })
  .get("/sessions/:id", dbProvider, async (c) => {
    const user = c.get("user");
    if (!user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const row = await db.getWhatsAppSessionById(c.var.db, c.req.param("id"));
    if (!row || row.userId !== user.id) {
      throw new HTTPException(404, { message: "Not found" });
    }

    return c.json({
      ok: true,
      data: serializeSession(row),
    });
  })
  .patch("/sessions/:id", dbProvider, async (c) => {
    const user = c.get("user");
    if (!user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const existing = await db.getWhatsAppSessionById(c.var.db, c.req.param("id"));
    if (!existing || existing.userId !== user.id) {
      throw new HTTPException(404, { message: "Not found" });
    }

    const body = await c.req.json<UpdateWhatsAppSessionBody>();
    if (body.agentId) {
      const agent = await getPersonalAgentById(c.var.db, body.agentId);
      if (!agent || agent.userId !== user.id) {
        throw new HTTPException(400, { message: "Invalid agent assignment" });
      }
    }

    const row = await db.updateWhatsAppSession(c.var.db, existing.id, parseUpdateBody(body));
    return c.json({ ok: true, data: row });
  })
  .delete("/sessions/:id", dbProvider, async (c) => {
    const user = c.get("user");
    if (!user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const existing = await db.getWhatsAppSessionById(c.var.db, c.req.param("id"));
    if (!existing || existing.userId !== user.id) {
      throw new HTTPException(404, { message: "Not found" });
    }

    await gateway.deleteGatewaySession(c.env, existing.gatewaySessionId).catch(() => null);
    await db.deleteWhatsAppSession(c.var.db, existing.id);
    return c.json({ ok: true });
  })

  // ── Gateway actions ──────────────────────────────────────────────────────
  .post("/sessions/:id/start", dbProvider, async (c) => {
    const user = c.get("user");
    if (!user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const existing = await db.getWhatsAppSessionById(c.var.db, c.req.param("id"));
    if (!existing || existing.userId !== user.id) {
      throw new HTTPException(404, { message: "Not found" });
    }

    const status = await gateway.startGatewaySession(
      c.env,
      existing.gatewaySessionId,
      getAppWebhookConfig(c),
    );
    await db.updateWhatsAppSession(c.var.db, existing.id, {
      status: status.status ?? "connecting",
    });
    return c.json({ ok: true, data: status });
  })
  .get("/sessions/:id/qr", dbProvider, async (c) => {
    const user = c.get("user");
    if (!user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const existing = await db.getWhatsAppSessionById(c.var.db, c.req.param("id"));
    if (!existing || existing.userId !== user.id) {
      throw new HTTPException(404, { message: "Not found" });
    }

    try {
      const qr = await gateway.getGatewaySessionQr(c.env, existing.gatewaySessionId);
      return c.json({ ok: true, data: qr });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ ok: true, data: { error: message, status: existing.status } });
    }
  })
  .post("/sessions/:id/pair-code", dbProvider, async (c) => {
    const user = c.get("user");
    if (!user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const existing = await db.getWhatsAppSessionById(c.var.db, c.req.param("id"));
    if (!existing || existing.userId !== user.id) {
      throw new HTTPException(404, { message: "Not found" });
    }

    const body = await c.req.json<{ phone?: string }>();
    if (!body.phone) {
      throw new HTTPException(400, { message: "phone required" });
    }

    const result = await gateway.requestGatewayPairCode(c.env, existing.gatewaySessionId, {
      phone: body.phone,
      ...getAppWebhookConfig(c),
    });
    await db.updateWhatsAppSession(c.var.db, existing.id, { status: result.status ?? "pairing" });
    return c.json({ ok: true, data: result });
  })
  .post("/sessions/:id/stop", dbProvider, async (c) => {
    const user = c.get("user");
    if (!user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const existing = await db.getWhatsAppSessionById(c.var.db, c.req.param("id"));
    if (!existing || existing.userId !== user.id) {
      throw new HTTPException(404, { message: "Not found" });
    }

    const result = await gateway.stopGatewaySession(c.env, existing.gatewaySessionId);
    await db.updateWhatsAppSession(c.var.db, existing.id, { status: "stopped" });
    return c.json({ ok: true, data: result });
  })
  .post("/sessions/:id/logout", dbProvider, async (c) => {
    const user = c.get("user");
    if (!user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const existing = await db.getWhatsAppSessionById(c.var.db, c.req.param("id"));
    if (!existing || existing.userId !== user.id) {
      throw new HTTPException(404, { message: "Not found" });
    }

    const result = await gateway.logoutGatewaySession(c.env, existing.gatewaySessionId);
    await db.updateWhatsAppSession(c.var.db, existing.id, { status: "logged_out" });
    return c.json({ ok: true, data: result });
  })

  // ── Send message ─────────────────────────────────────────────────────────
  .post("/send", dbProvider, async (c) => {
    const user = c.get("user");
    if (!user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const body = await c.req.json<{ session: string; chatId: string; text: string }>();
    if (!body.session || !body.chatId || !body.text) {
      throw new HTTPException(400, { message: "session, chatId, and text required" });
    }

    const existing = await db.getWhatsAppSessionById(c.var.db, body.session);
    if (!existing || existing.userId !== user.id) {
      throw new HTTPException(404, { message: "Session not found" });
    }

    await gateway.sendWhatsAppText(c.env, existing.gatewaySessionId, body.chatId, body.text);
    return c.json({ ok: true });
  });

export const whatsappCurrentUserRouter = new Hono<HonoAppType>()
  .use("*", dbProvider)
  .get("/session", async (c) => {
    const user = c.get("user");
    if (!user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const session = await getPrimarySessionForUser(c.var.db, user.id);
    if (!session) {
      return c.json({ status: "STOPPED", error: "Session not found" });
    }

    return c.json(serializeSession(session));
  })
  .post("/session", async (c) => {
    const user = c.get("user");
    if (!user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const session = await ensurePrimarySessionForUser(c.var.db, user.id);
    const status = await gateway.startGatewaySession(
      c.env,
      session.gatewaySessionId,
      getAppWebhookConfig(c),
    );
    const updated = await db.updateWhatsAppSession(c.var.db, session.id, {
      status: status.status ?? "connecting",
    });

    return c.json(serializeSession(updated));
  })
  .get("/qr", async (c) => {
    const user = c.get("user");
    if (!user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const session = await getPrimarySessionForUser(c.var.db, user.id);
    if (!session) {
      throw new HTTPException(404, { message: "Not found" });
    }

    const data = await gateway.getGatewaySessionQr(c.env, session.gatewaySessionId);
    return c.json({
      ...data,
      image: data.qr ?? null,
      value: data.raw ?? null,
    });
  })
  .post("/pair", async (c) => {
    const user = c.get("user");
    if (!user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const body = await c.req.json<{ phone?: string }>();
    if (!body.phone) {
      throw new HTTPException(400, { message: "phone required" });
    }

    const session = await ensurePrimarySessionForUser(c.var.db, user.id);
    const result = await gateway.requestGatewayPairCode(c.env, session.gatewaySessionId, {
      phone: body.phone,
      ...getAppWebhookConfig(c),
    });
    await db.updateWhatsAppSession(c.var.db, session.id, { status: result.status ?? "pairing" });

    return c.json(result);
  })
  .post("/stop", async (c) => {
    const user = c.get("user");
    if (!user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const session = await getPrimarySessionForUser(c.var.db, user.id);
    if (!session) {
      throw new HTTPException(404, { message: "Not found" });
    }

    const result = await gateway.stopGatewaySession(c.env, session.gatewaySessionId);
    await db.updateWhatsAppSession(c.var.db, session.id, { status: "stopped" });

    return c.json(result);
  })
  .post("/logout", async (c) => {
    const user = c.get("user");
    if (!user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const session = await getPrimarySessionForUser(c.var.db, user.id);
    if (!session) {
      throw new HTTPException(404, { message: "Not found" });
    }

    const result = await gateway.logoutGatewaySession(c.env, session.gatewaySessionId);
    await db.updateWhatsAppSession(c.var.db, session.id, { status: "logged_out" });

    return c.json(result);
  });

export const whatsappNamedSessionRouter = new Hono<HonoAppType>()
  .use("*", dbProvider)
  .get("/:slug/session", async (c) => {
    const user = c.get("user");
    if (!user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const slug = c.req.param("slug").trim();
    const session = await getOwnedSessionBySlug(c.var.db, user.id, slug);

    if (!session) {
      return c.json({ status: "STOPPED", error: "Session not found" });
    }

    return c.json(serializeSession(session));
  })
  .post("/:slug/session", async (c) => {
    const user = c.get("user");
    if (!user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const slug = c.req.param("slug").trim();
    if (!slug) {
      throw new HTTPException(400, { message: "slug required" });
    }

    const session = await ensureOwnedSessionBySlug(c.var.db, user.id, slug);
    const status = await gateway.startGatewaySession(
      c.env,
      session.gatewaySessionId,
      getAppWebhookConfig(c),
    );
    const updated = await db.updateWhatsAppSession(c.var.db, session.id, {
      status: status.status ?? "connecting",
    });

    return c.json(serializeSession(updated));
  })
  .get("/:slug/qr", async (c) => {
    const user = c.get("user");
    if (!user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const slug = c.req.param("slug").trim();
    const session = await getOwnedSessionBySlug(c.var.db, user.id, slug);
    if (!session) {
      throw new HTTPException(404, { message: "Not found" });
    }

    const data = await gateway.getGatewaySessionQr(c.env, session.gatewaySessionId);
    return c.json({
      ...data,
      image: data.qr ?? null,
      value: data.raw ?? null,
    });
  })
  .post("/:slug/pair", async (c) => {
    const user = c.get("user");
    if (!user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const slug = c.req.param("slug").trim();
    if (!slug) {
      throw new HTTPException(400, { message: "slug required" });
    }

    const body = await c.req.json<{ phone?: string }>();
    if (!body.phone) {
      throw new HTTPException(400, { message: "phone required" });
    }

    const session = await ensureOwnedSessionBySlug(c.var.db, user.id, slug);
    const result = await gateway.requestGatewayPairCode(c.env, session.gatewaySessionId, {
      phone: body.phone,
      ...getAppWebhookConfig(c),
    });
    await db.updateWhatsAppSession(c.var.db, session.id, { status: result.status ?? "pairing" });

    return c.json(result);
  })
  .post("/:slug/stop", async (c) => {
    const user = c.get("user");
    if (!user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const slug = c.req.param("slug").trim();
    const session = await getOwnedSessionBySlug(c.var.db, user.id, slug);
    if (!session) {
      throw new HTTPException(404, { message: "Not found" });
    }

    const result = await gateway.stopGatewaySession(c.env, session.gatewaySessionId);
    await db.updateWhatsAppSession(c.var.db, session.id, { status: "stopped" });

    return c.json(result);
  })
  .post("/:slug/logout", async (c) => {
    const user = c.get("user");
    if (!user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const slug = c.req.param("slug").trim();
    const session = await getOwnedSessionBySlug(c.var.db, user.id, slug);
    if (!session) {
      throw new HTTPException(404, { message: "Not found" });
    }

    const result = await gateway.logoutGatewaySession(c.env, session.gatewaySessionId);
    await db.updateWhatsAppSession(c.var.db, session.id, { status: "logged_out" });

    return c.json(result);
  });
