import { getLogger } from "@logtape/logtape";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { nanoid } from "nanoid";
import { LOGGER_NAME } from "../constants";
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
  };
}

function getWebhookStatus(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const status = (payload as StatusWebhookPayload).status;
  return typeof status === "string" && status.trim() ? status : null;
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

    if (rawBody.event === "session.status") {
      const status = getWebhookStatus(rawBody.payload);
      if (status) {
        await db.updateWhatsAppSessionByGatewaySessionId(d1, gatewaySessionId, { status });
      }

      return c.text("OK", 200);
    }

    const messageBody = rawBody as BaileysWebhook;
    const session = await db.getWhatsAppSessionByGatewaySessionId(d1, gatewaySessionId);
    if (!session) {
      logger.debug(`[WhatsApp] No session for gatewaySession=${gatewaySessionId}`);
      return c.text("OK", 200);
    }

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

    const threadKey = `${gatewaySessionId}:${chatThreadKey}`;
    const origin = new URL(c.req.url).origin;

    const props: WhatsAppBotProps = {
      sessionId: gatewaySessionId,
      agentName: session.displayName,
      systemPrompt: session.systemPrompt ?? "You are a helpful assistant.",
      model: session.model ?? "gpt-4.1-mini",
      temperature: session.temperature ?? 20,
      maxTokens: session.maxTokens ?? 900,
      groupPolicy: session.groupPolicy as WhatsAppBotProps["groupPolicy"],
      dmPolicy: session.dmPolicy as WhatsAppBotProps["dmPolicy"],
      autoReply: session.autoReply ?? true,
    };

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
      return await stub.fetch(doReq);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("[WhatsApp] DO error", { error: message });
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
    let gatewaySessions = new Map<string, gateway.GatewaySessionStatus>();

    try {
      const statuses = await gateway.listGatewaySessions(c.env);
      gatewaySessions = new Map(statuses.map((session) => [session.id, session]));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("[WhatsApp] Failed to list gateway sessions", { error: message });
    }

    const data = [];
    for (const row of rows) {
      const gatewayStatus = gatewaySessions.get(row.gatewaySessionId);
      const status = gatewayStatus?.status ?? row.status;
      if (status !== row.status) {
        await db.updateWhatsAppSession(c.var.db, row.id, { status });
      }

      data.push({
        ...row,
        status,
        linked: gatewayStatus?.linked ?? false,
        hasQr: gatewayStatus?.hasQr ?? false,
        pairingCode: gatewayStatus?.pairingCode ?? null,
      });
    }

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

    let gatewayStatus: gateway.GatewaySessionStatus | null = null;
    try {
      gatewayStatus = await gateway.getGatewaySessionStatus(c.env, row.gatewaySessionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("[WhatsApp] Failed to get gateway session status", {
        error: message,
        gatewaySessionId: row.gatewaySessionId,
      });
    }

    const status = gatewayStatus?.status ?? row.status;
    if (status !== row.status) {
      await db.updateWhatsAppSession(c.var.db, row.id, { status });
    }

    return c.json({
      ok: true,
      data: {
        ...row,
        status,
        linked: gatewayStatus?.linked ?? false,
        hasQr: gatewayStatus?.hasQr ?? false,
        pairingCode: gatewayStatus?.pairingCode ?? null,
      },
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

    const status = await gateway.startGatewaySession(c.env, existing.gatewaySessionId);
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
