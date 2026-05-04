import { createOpenAI } from "@ai-sdk/openai";
import { getLogger } from "@logtape/logtape";
import type { AgentContext } from "agents";
import { AIChatAgent } from "agents/ai-chat-agent";
import type { StreamTextOnFinishCallback, ToolSet, UIMessage } from "ai";
import { convertToModelMessages, streamText } from "ai";
import { LOGGER_NAME } from "../constants";
import { prepareErrorForLogging } from "../lib/errors";
import type { BaileysWebhook, InboundMessage } from "./channels";
import {
  isBotMentioned,
  isWhatsAppGroupJid,
  parseWhatsAppWebhook,
  shouldSkipWhatsAppMessage,
} from "./channels";
import { sendWhatsAppText } from "./gateway";

const logger = getLogger([LOGGER_NAME, "whatsapp-bot"]);

export interface WhatsAppBotProps {
  sessionId: string;
  agentName: string;
  systemPrompt: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  groupPolicy?: "mention" | "always" | "disabled";
  dmPolicy?: "always" | "disabled";
}

/**
 * One DO per conversation (per payload.from / chatId).
 * Each DO stores only that conversation's messages in its own SQLite
 * via AIChatAgent's built-in cf_ai_chat_agent_messages table.
 */
export class WhatsAppBotAgent extends AIChatAgent<CloudflareBindings> {
  props: WhatsAppBotProps | null = null;

  constructor(ctx: AgentContext, env: CloudflareBindings) {
    super(ctx, env);
  }

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
        logger.debug(`[WhatsApp] Skipped: ${skipReason}`);
        return new Response("OK");
      }

      const message = parseWhatsAppWebhook(body);
      const text = message.text?.trim();
      if (!text || message.fromMe) {
        return new Response("OK");
      }

      if (!this.props) {
        logger.error("[WhatsApp] No props loaded for conversation DO");
        return new Response("No props — binding may be missing", { status: 500 });
      }

      if (this.shouldIgnoreMessage(message)) {
        return new Response("OK");
      }

      // Build user message as UIMessage and persist
      const userMessage: UIMessage = {
        id: crypto.randomUUID(),
        role: "user",
        parts: [{ type: "text", text }],
      };
      this.messages.push(userMessage);
      await this.persistMessages(this.messages);

      let reply = "";
      try {
        reply = await this.runInference();
      } catch (err) {
        logger.error("Inference error", { error: prepareErrorForLogging(err) });
        reply = "Sorry, I couldn't respond right now.";
      }

      if (!reply) {
        return new Response("OK");
      }

      // Build assistant message as UIMessage and persist
      const assistantMessage: UIMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        parts: [{ type: "text", text: reply }],
      };
      this.messages.push(assistantMessage);
      await this.persistMessages(this.messages);

      try {
        await sendWhatsAppText(this.env, this.props.sessionId, message.sender, reply);
      } catch (err) {
        logger.error("[WhatsApp] Failed to send reply", {
          error: prepareErrorForLogging(err),
          to: message.sender,
        });
        // Don't crash — message is already persisted; sending can retry later
      }
      return new Response("OK");
    } catch (err: any) {
      logger.error("[WhatsAppBotAgent] onRequest crashed", { error: prepareErrorForLogging(err) });
      return new Response(
        JSON.stringify({ error: err?.message || String(err), stack: err?.stack }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  private refreshPropsFromRequest(request: Request): void {
    const rawProps = request.headers.get("x-partykit-props");
    if (!rawProps) return;
    try {
      this.props = JSON.parse(rawProps) as WhatsAppBotProps;
    } catch (error) {
      logger.warn("[WhatsApp] Failed to parse agent props header", {
        error: prepareErrorForLogging(error),
      });
    }
  }

  private shouldIgnoreMessage(message: InboundMessage): boolean {
    if (!this.props) return true;

    const isGroup = this.isGroupMessage(message);
    if (!isGroup) return this.props.dmPolicy === "disabled";
    if (this.props.groupPolicy === "disabled") return true;
    if (this.props.groupPolicy === "always") return false;

    const body = message.text ?? "";
    if (/^\s*\/(research|factcheck|verify)\b/i.test(body)) return false;

    const raw = message.raw as BaileysWebhook;
    return !isBotMentioned({
      body,
      mentionedJids: raw.payload.mentionedJids,
      selfJid: raw.payload.selfJid,
      agentName: this.props.agentName,
      mentionPatterns: ["research", "research whatsapp", "fact check", "factcheck", "verify"],
    });
  }

  private isGroupMessage(message: InboundMessage): boolean {
    const raw = message.raw as BaileysWebhook;
    return Boolean(raw.payload.isGroup) || isWhatsAppGroupJid(message.sender);
  }

  private async runInference(): Promise<string> {
    if (!this.props) throw new Error("No props");

    const openai = createOpenAI({ apiKey: this.env.OPENAI_API_KEY });
    const messages = convertToModelMessages(this.messages);

    const result = streamText({
      model: openai(this.props.model),
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

  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal },
  ) {
    if (!this.props) {
      return new Response("No agent configured", { status: 400 });
    }

    const openai = createOpenAI({ apiKey: this.env.OPENAI_API_KEY });
    const messages = convertToModelMessages(this.messages);

    const result = streamText({
      model: openai(this.props.model),
      system: this.buildPrompt(),
      messages,
      onFinish,
      abortSignal: options?.abortSignal,
    });

    return result.toUIMessageStreamResponse();
  }
}
