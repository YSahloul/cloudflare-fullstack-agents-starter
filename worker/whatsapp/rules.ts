import type { BaileysWebhook, InboundMessage } from "./channels";
import { isBotMentioned, isWhatsAppGroupJid } from "./channels";

export interface WhatsAppReplyRules {
  agentName?: string;
  autoReply?: boolean;
  groupPolicy?: "mention" | "always" | "disabled";
  dmPolicy?: "always" | "disabled";
}

export type ReplyDecision =
  | { shouldReply: true; reason: "dm_allowed" | "group_always" | "group_mention" | "group_command" }
  | { shouldReply: false; reason: string };

export function isGroupInboundMessage(message: InboundMessage): boolean {
  const raw = message.raw as BaileysWebhook;
  return Boolean(raw.payload.isGroup) || isWhatsAppGroupJid(message.sender);
}

export function isMentionedInboundMessage(
  message: InboundMessage,
  rules: Pick<WhatsAppReplyRules, "agentName">,
): boolean {
  const raw = message.raw as BaileysWebhook;
  return isBotMentioned({
    body: message.text ?? "",
    mentionedJids: raw.payload.mentionedJids,
    selfJid: raw.payload.selfJid,
    agentName: rules.agentName,
    mentionPatterns: ["research", "research whatsapp", "fact check", "factcheck", "verify"],
  });
}

export function evaluateWhatsAppReplyRules(
  message: InboundMessage,
  rules: WhatsAppReplyRules,
): ReplyDecision {
  if (!rules.autoReply) {
    return { shouldReply: false, reason: "auto_reply_disabled" };
  }

  if (message.fromMe) {
    return { shouldReply: false, reason: "from_me" };
  }

  const body = message.text?.trim() ?? "";
  if (!body) {
    return { shouldReply: false, reason: "empty_text" };
  }

  const isGroup = isGroupInboundMessage(message);
  if (!isGroup) {
    if (rules.dmPolicy === "disabled") {
      return { shouldReply: false, reason: "dm_policy_disabled" };
    }

    return { shouldReply: true, reason: "dm_allowed" };
  }

  if (rules.groupPolicy === "disabled") {
    return { shouldReply: false, reason: "group_policy_disabled" };
  }

  if (rules.groupPolicy === "always") {
    return { shouldReply: true, reason: "group_always" };
  }

  if (/^\s*\/(research|factcheck|verify)\b/i.test(body)) {
    return { shouldReply: true, reason: "group_command" };
  }

  if (isMentionedInboundMessage(message, rules)) {
    return { shouldReply: true, reason: "group_mention" };
  }

  return { shouldReply: false, reason: "group_not_mentioned" };
}
