export interface BaileysMediaPayload {
  url: string;
  mimetype: string;
  caption?: string;
}

export interface BaileysPayload {
  id: string;
  from: string;
  fromMe: boolean;
  body?: string;
  type: string;
  isGroup?: boolean;
  participant?: string;
  pushName?: string;
  mentionedJids?: string[];
  selfJid?: string;
  groupPolicy?: "mention" | "always" | "disabled";
  media?: BaileysMediaPayload;
  timestamp?: number;
  lid?: string;
  participantLid?: string;
}

export interface BaileysWebhook {
  event: string;
  session: string;
  payload: BaileysPayload;
}

export interface InboundMessage {
  channel: "whatsapp";
  sender: string;
  text?: string;
  fromMe: boolean;
  timestamp: number;
  raw: unknown;
}

export class WhatsAppParseError extends Error {
  constructor(message: string) {
    super(`[WhatsApp adapter] ${message}`);
    this.name = "WhatsAppParseError";
  }
}

export function shouldSkipWhatsAppMessage(webhook: BaileysWebhook): string | null {
  const { event, payload } = webhook;
  if (event !== "message") return `event="${event}" (not "message")`;
  if (!payload.from) return "missing payload.from";
  const isText = payload.type === "chat";
  const isMedia = !!payload.media;
  if (!isText && !isMedia) return `type="${payload.type}" (not chat or media)`;
  if (isText && !payload.body?.trim()) return "empty body";
  return null;
}

export function parseWhatsAppWebhook(body: unknown): InboundMessage {
  if (!body || typeof body !== "object")
    throw new WhatsAppParseError("body must be a non-null object");

  const webhook = body as Record<string, unknown>;
  if (typeof webhook.event !== "string")
    throw new WhatsAppParseError('missing or invalid "event" field');
  if (typeof webhook.session !== "string")
    throw new WhatsAppParseError('missing or invalid "session" field');
  if (!webhook.payload || typeof webhook.payload !== "object")
    throw new WhatsAppParseError('missing or invalid "payload" field');

  const payload = webhook.payload as Record<string, unknown>;
  if (typeof payload.from !== "string")
    throw new WhatsAppParseError('missing or invalid "payload.from" field');

  const from = payload.from as string;
  const fromMe = Boolean(payload.fromMe);
  const bodyText = typeof payload.body === "string" ? payload.body : undefined;
  const type = typeof payload.type === "string" ? payload.type : "";

  let text: string | undefined;
  if (type === "chat" && bodyText?.trim()) {
    text = bodyText;
  } else if (payload.media && typeof payload.media === "object") {
    const rawMedia = payload.media as Record<string, unknown>;
    if (typeof rawMedia.caption === "string") text = rawMedia.caption;
  }

  const rawTs = payload.timestamp;
  const timestamp = typeof rawTs === "number" ? (rawTs > 1e10 ? rawTs : rawTs * 1000) : Date.now();

  return { channel: "whatsapp", sender: from, text, fromMe, timestamp, raw: body };
}

export function getWhatsAppThreadKey(webhook: BaileysWebhook): string {
  const from = webhook.payload?.from;
  if (!from || !from.trim()) throw new Error("Missing WhatsApp payload.from for thread key");
  return from;
}

export function isWhatsAppGroupJid(jid: string): boolean {
  return jid.endsWith("@g.us");
}

export interface MentionCheckParams {
  body: string;
  mentionedJids?: string[];
  selfJid?: string;
  agentName?: string;
  mentionPatterns?: string[];
}

export function jidToPhone(jid: string): string | null {
  const match = jid.match(/^(\d+)/);
  return match ? match[1] : null;
}

function bareJid(jid: string): string {
  return jid.replace(/:\d+@/, "@");
}

function cleanMentionText(text: string): string {
  return text
    .replace(/[\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isBotMentioned(params: MentionCheckParams): boolean {
  const { body, mentionedJids, selfJid, agentName, mentionPatterns } = params;

  if (mentionedJids?.length && selfJid) {
    const selfBare = bareJid(selfJid);
    const selfPhone = jidToPhone(selfJid);
    for (const jid of mentionedJids) {
      if (bareJid(jid) === selfBare) return true;
      if (selfPhone && jidToPhone(jid) === selfPhone) return true;
    }
  }

  const cleaned = cleanMentionText(body);

  if (selfJid) {
    const selfPhone = jidToPhone(selfJid);
    if (selfPhone && selfPhone.length >= 10) {
      const phonePattern = new RegExp(`\\+?${selfPhone.replace(/^0+/, "")}`, "i");
      if (phonePattern.test(cleaned.replace(/[\s-]/g, ""))) return true;
    }
  }

  if (agentName && agentName.length >= 2) {
    const escaped = agentName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nameRe = new RegExp(`(?:^|\\W)@?${escaped}(?:\\W|$)`, "i");
    if (nameRe.test(cleaned)) return true;
  }

  if (mentionPatterns?.length) {
    for (const pattern of mentionPatterns) {
      if (pattern.length < 2) continue;
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(?:^|\\W)@?${escaped}(?:\\W|$)`, "i");
      if (re.test(cleaned)) return true;
    }
  }

  return false;
}
