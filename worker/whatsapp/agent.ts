import { createOpenAI } from "@ai-sdk/openai";
import { getLogger } from "@logtape/logtape";
import { AIChatAgent } from "agents/ai-chat-agent";
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
      if (!text) {
        logger.debug("[WhatsApp] Captured message without replyable text");
        return new Response("OK");
      }

      const formattedText = formatWhatsAppInboundMessageForModel(message);
      await this.captureInboundMessage(formattedText);

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
      logger.debug("[WhatsApp] Reply decision", { reason: decision.reason });
      if (!decision.shouldReply) {
        return new Response("OK");
      }

      let reply = "";
      try {
        reply = await this.runInference();
      } catch (error) {
        logger.error("Inference error", { error: prepareErrorForLogging(error) });
        reply = "Sorry, I couldn't respond right now.";
      }

      if (!reply) {
        return new Response("OK");
      }

      await this.captureAssistantReply(reply);

      try {
        await sendWhatsAppText(this.env, this.props.sessionId, message.sender, reply);
      } catch (error) {
        logger.error("[WhatsApp] Failed to send reply", {
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
      return;
    }

    try {
      this.props = JSON.parse(rawProps) as WhatsAppBotProps;
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

    const messages = convertToModelMessages(this.messages);
    const result = streamText({
      model: this.getGatewayModel(),
      system: this.buildPrompt(),
      messages,
      maxOutputTokens: this.props.maxTokens ?? 900,
      temperature: (this.props.temperature ?? 20) / 100,
    });

    return (await result.text).trim();
  }

  private buildPrompt(): string {
    const base = this.props?.systemPrompt ?? "You are a helpful assistant.";
    return [base, "You are replying on WhatsApp. Keep answers concise and mobile-friendly."].join(
      "\n\n",
    );
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

    const result = streamText({
      model: this.getGatewayModel(),
      system: this.buildPrompt(),
      messages,
      onFinish,
      abortSignal: options?.abortSignal,
    });

    return result.toUIMessageStreamResponse();
  }
}
