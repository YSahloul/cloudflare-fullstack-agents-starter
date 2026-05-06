import { createOpenAI } from "@ai-sdk/openai";
import { getLogger } from "@logtape/logtape";
import { AIChatAgent } from "@cloudflare/ai-chat";
import type { StreamTextOnFinishCallback, ToolSet, UIMessage } from "ai";
import { convertToModelMessages, streamText } from "ai";
import { createAiGateway } from "ai-gateway-provider";
import { LOGGER_NAME } from "../constants";
import { prepareErrorForLogging } from "../lib/errors";
import type { BaileysWebhook } from "./channels";
import {
  formatWhatsAppInboundMessageForModel,
  parseWhatsAppWebhook,
  shouldSkipWhatsAppMessage,
} from "./channels";
import { sendWhatsAppText } from "./gateway";
import { evaluateWhatsAppReplyRules } from "./rules";

const logger = getLogger([LOGGER_NAME, "whatsapp-bot"]);

export interface WhatsAppBotProps {
  sessionId: string;
  agentId?: string | null;
  agentName: string;
  systemPrompt: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  groupPolicy?: "mention" | "always" | "disabled";
  dmPolicy?: "always" | "disabled";
  autoReply?: boolean;
}

/**
 * One DO per WhatsApp conversation.
 * Webhook events are routed here by `${gatewaySessionId}:${chatJid}`.
 * The DO captures inbound messages first, then applies reply rules.
 */
export class WhatsAppBotAgent extends AIChatAgent<CloudflareBindings> {
  props: WhatsAppBotProps | null = null;

  async onStart(props: Record<string, unknown>): Promise<void> {
    this.props = props as unknown as WhatsAppBotProps;

    logger.info("[WhatsApp] Conversation DO started", {
      sessionId: this.props.sessionId,
      agentId: this.props.agentId ?? null,
      agentName: this.props.agentName,
      model: this.props.model,
      autoReply: this.props.autoReply,
      groupPolicy: this.props.groupPolicy,
      dmPolicy: this.props.dmPolicy,
      hasSystemPrompt: Boolean(this.props.systemPrompt?.trim()),
    });
  }

  async onRequest(request: Request): Promise<Response> {
    try {
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }

      this.refreshPropsFromRequest(request);

      let body: BaileysWebhook;
      try {
        body = await request.json<BaileysWebhook>();
      } catch {
        return new Response("Invalid JSON", { status: 400 });
      }

      const skipReason = shouldSkipWhatsAppMessage(body);
      if (skipReason) {
        logger.debug(`[WhatsApp] Captured no-op event: ${skipReason}`);
        return new Response("OK");
      }

      const message = parseWhatsAppWebhook(body);
      const text = message.text?.trim();

      logger.info("[WhatsApp] Conversation DO received message", {
        sessionId: body.session,
        event: body.event,
        from: body.payload?.from,
        fromMe: body.payload?.fromMe,
        type: body.payload?.type,
        isGroup: body.payload?.isGroup,
        hasText: Boolean(text),
        textLength: text?.length ?? 0,
      });

      if (!text) {
        logger.debug("[WhatsApp] Captured message without replyable text", {
          sessionId: body.session,
          from: body.payload?.from,
          type: body.payload?.type,
        });
        return new Response("OK");
      }

      const formattedText = formatWhatsAppInboundMessageForModel(message);
      await this.captureInboundMessage(formattedText);

      logger.info("[WhatsApp] Inbound message captured", {
        sessionId: body.session,
        messageCount: this.messages.length,
        formattedTextLength: formattedText.length,
      });

      if (!this.props) {
        logger.error("[WhatsApp] No props loaded for conversation DO");
        return new Response("No props — binding may be missing", { status: 500 });
      }

      const decision = evaluateWhatsAppReplyRules(message, {
        agentName: this.props.agentName,
        autoReply: this.props.autoReply,
        groupPolicy: this.props.groupPolicy,
        dmPolicy: this.props.dmPolicy,
      });
      logger.info("[WhatsApp] Reply decision", {
        reason: decision.reason,
        shouldReply: decision.shouldReply,
        sessionId: body.session,
        from: body.payload?.from,
      });

      if (!decision.shouldReply) {
        return new Response("OK");
      }

      let reply = "";
      try {
        reply = await this.runInference();
      } catch (error) {
        logger.error("[WhatsApp] Inference error", {
          sessionId: body.session,
          from: body.payload?.from,
          error: prepareErrorForLogging(error),
        });
        reply = "Sorry, I couldn't verify that right now.";
      }

      if (!reply) {
        logger.warn("[WhatsApp] Inference returned empty reply", {
          sessionId: body.session,
          from: body.payload?.from,
        });
        return new Response("OK");
      }

      logger.info("[WhatsApp] Reply generated", {
        sessionId: body.session,
        from: body.payload?.from,
        replyLength: reply.length,
      });

      await this.captureAssistantReply(reply);

      try {
        await sendWhatsAppText(this.env, this.props.sessionId, message.sender, reply);
        logger.info("[WhatsApp] Reply sent to gateway", {
          sessionId: this.props.sessionId,
          to: message.sender,
          replyLength: reply.length,
        });
      } catch (error) {
        logger.error("[WhatsApp] Failed to send reply", {
          sessionId: this.props.sessionId,
          error: prepareErrorForLogging(error),
          to: message.sender,
        });
      }

      return new Response("OK");
    } catch (error) {
      logger.error("[WhatsAppBotAgent] onRequest crashed", {
        error: prepareErrorForLogging(error),
      });
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      return new Response(JSON.stringify({ error: message, stack }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  private refreshPropsFromRequest(request: Request): void {
    const rawProps = request.headers.get("x-partykit-props");
    if (!rawProps) {
      logger.warn("[WhatsApp] Missing x-partykit-props header");
      return;
    }

    try {
      this.props = JSON.parse(rawProps) as WhatsAppBotProps;
      logger.debug("[WhatsApp] Props refreshed from request", {
        sessionId: this.props.sessionId,
        agentId: this.props.agentId ?? null,
        agentName: this.props.agentName,
        model: this.props.model,
      });
    } catch (error) {
      logger.warn("[WhatsApp] Failed to parse agent props header", {
        error: prepareErrorForLogging(error),
      });
    }
  }

  private async captureInboundMessage(text: string): Promise<void> {
    const userMessage: UIMessage = {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text }],
    };
    this.messages.push(userMessage);
    await this.persistMessages(this.messages);
  }

  private async captureAssistantReply(reply: string): Promise<void> {
    const assistantMessage: UIMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      parts: [{ type: "text", text: reply }],
    };
    this.messages.push(assistantMessage);
    await this.persistMessages(this.messages);
  }

  private async runInference(): Promise<string> {
    if (!this.props) {
      throw new Error("No props");
    }

    const tools = this.mcp.getAITools() as unknown as ToolSet;
    const toolNames = Object.keys(tools);
    const messages = convertToModelMessages(this.messages);
    const start = Date.now();

    logger.info("[WhatsApp] Starting inference", {
      sessionId: this.props.sessionId,
      model: this.props.model,
      messageCount: this.messages.length,
      toolCount: toolNames.length,
      toolNames,
      maxTokens: this.props.maxTokens ?? 900,
      temperature: (this.props.temperature ?? 20) / 100,
    });

    const result = streamText({
      model: this.getGatewayModel(),
      system: this.buildPrompt(),
      messages: await messages,
      tools,
      maxOutputTokens: this.props.maxTokens ?? 900,
      temperature: (this.props.temperature ?? 20) / 100,
    });

    const text = (await result.text).trim();

    logger.info("[WhatsApp] Inference completed", {
      sessionId: this.props.sessionId,
      durationMs: Date.now() - start,
      replyLength: text.length,
    });

    return text;
  }

  private buildPrompt(): string {
    const base =
      this.props?.systemPrompt ??
      [
        "You are a research and fact-check agent, not a casual conversational assistant.",
        "Verify claims carefully and answer with evidence.",
      ].join(" ");

    return [
      base,
      "You are replying on WhatsApp. Keep answers concise and mobile-friendly.",
      "Return: Truth meter, Summary, Sources.",
    ].join("\n\n");
  }

  private getGatewayModel() {
    if (!this.props) {
      throw new Error("No props");
    }

    const openai = createOpenAI({ apiKey: this.env.OPENAI_API_KEY });
    const aiGateway = createAiGateway({
      accountId: this.env.CLOUDFLARE_ACCOUNT_ID,
      gateway: this.env.CLOUDFLARE_AI_GATEWAY_ID,
      options: {
        skipCache: true,
        metadata: {
          channel: "whatsapp",
          agentId: this.props.agentId ?? "unassigned",
          agentName: this.props.agentName,
          sessionId: this.props.sessionId,
          model: this.props.model,
        },
      },
    });

    return aiGateway([openai(this.props.model)]);
  }

  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal },
  ) {
    if (!this.props) {
      return new Response("No agent configured", { status: 400 });
    }

    const messages = convertToModelMessages(this.messages);

    const tools = this.mcp.getAITools() as unknown as ToolSet;

    logger.info("[WhatsApp] Starting chat inference", {
      sessionId: this.props.sessionId,
      model: this.props.model,
      messageCount: this.messages.length,
      toolCount: Object.keys(tools).length,
    });

    const result = streamText({
      model: this.getGatewayModel(),
      system: this.buildPrompt(),
      messages: await messages,
      tools,
      onFinish,
      abortSignal: options?.abortSignal,
    });

    return result.toUIMessageStreamResponse();
  }
}
