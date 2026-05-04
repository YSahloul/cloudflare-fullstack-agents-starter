import { describe, expect, it } from "vitest";
import type { BaileysWebhook, InboundMessage } from "./channels";
import { getWhatsAppThreadKey, parseWhatsAppWebhook } from "./channels";
import { evaluateWhatsAppReplyRules, isGroupInboundMessage } from "./rules";

function webhook(overrides: Partial<BaileysWebhook["payload"]> = {}): BaileysWebhook {
  return {
    event: "message",
    session: "wa_user_session",
    payload: {
      id: "msg-1",
      from: "15551234567@s.whatsapp.net",
      fromMe: false,
      body: "hello",
      type: "chat",
      timestamp: 1_700_000_000,
      ...overrides,
    },
  };
}

function message(overrides: Partial<BaileysWebhook["payload"]> = {}): InboundMessage {
  return parseWhatsAppWebhook(webhook(overrides));
}

describe("WhatsApp deterministic routing", () => {
  it("uses payload.from as the deterministic chat thread key for DMs", () => {
    const body = webhook({ from: "15551234567@s.whatsapp.net" });

    expect(getWhatsAppThreadKey(body)).toBe("15551234567@s.whatsapp.net");
  });

  it("uses the group JID as the thread key, not the participant JID", () => {
    const body = webhook({
      from: "120363999999999@g.us",
      isGroup: true,
      participant: "15551234567@s.whatsapp.net",
    });

    expect(getWhatsAppThreadKey(body)).toBe("120363999999999@g.us");
    expect(getWhatsAppThreadKey(body)).not.toBe(body.payload.participant);
  });

  it("scopes the Durable Object name by gateway session and chat JID", () => {
    const gatewaySessionId = "wa_app_user_session";
    const chatJid = getWhatsAppThreadKey(webhook({ from: "15551234567@s.whatsapp.net" }));

    expect(`${gatewaySessionId}:${chatJid}`).toBe("wa_app_user_session:15551234567@s.whatsapp.net");
  });
});

describe("WhatsApp reply rules", () => {
  it("does not reply when autoReply is disabled", () => {
    const decision = evaluateWhatsAppReplyRules(message(), {
      autoReply: false,
      dmPolicy: "always",
      groupPolicy: "mention",
    });

    expect(decision).toEqual({ shouldReply: false, reason: "auto_reply_disabled" });
  });

  it("does not reply to messages from the connected WhatsApp account", () => {
    const decision = evaluateWhatsAppReplyRules(message({ fromMe: true }), {
      autoReply: true,
      dmPolicy: "always",
      groupPolicy: "mention",
    });

    expect(decision).toEqual({ shouldReply: false, reason: "from_me" });
  });

  it("replies to DMs when DM policy allows it", () => {
    const decision = evaluateWhatsAppReplyRules(message(), {
      autoReply: true,
      dmPolicy: "always",
      groupPolicy: "mention",
    });

    expect(decision).toEqual({ shouldReply: true, reason: "dm_allowed" });
  });

  it("does not reply to DMs when DM policy is disabled", () => {
    const decision = evaluateWhatsAppReplyRules(message(), {
      autoReply: true,
      dmPolicy: "disabled",
      groupPolicy: "mention",
    });

    expect(decision).toEqual({ shouldReply: false, reason: "dm_policy_disabled" });
  });

  it("identifies group messages from isGroup or @g.us", () => {
    expect(isGroupInboundMessage(message({ from: "120363999999999@g.us" }))).toBe(true);
    expect(
      isGroupInboundMessage(message({ from: "15551234567@s.whatsapp.net", isGroup: true })),
    ).toBe(true);
  });

  it("does not reply to groups when group policy is disabled", () => {
    const decision = evaluateWhatsAppReplyRules(message({ from: "120363999999999@g.us" }), {
      autoReply: true,
      dmPolicy: "always",
      groupPolicy: "disabled",
    });

    expect(decision).toEqual({ shouldReply: false, reason: "group_policy_disabled" });
  });

  it("replies to groups when group policy is always", () => {
    const decision = evaluateWhatsAppReplyRules(message({ from: "120363999999999@g.us" }), {
      autoReply: true,
      dmPolicy: "always",
      groupPolicy: "always",
    });

    expect(decision).toEqual({ shouldReply: true, reason: "group_always" });
  });

  it("replies to group commands under mention policy", () => {
    const decision = evaluateWhatsAppReplyRules(
      message({ from: "120363999999999@g.us", body: "/research this" }),
      {
        autoReply: true,
        dmPolicy: "always",
        groupPolicy: "mention",
      },
    );

    expect(decision).toEqual({ shouldReply: true, reason: "group_command" });
  });

  it("replies to group mentions under mention policy", () => {
    const decision = evaluateWhatsAppReplyRules(
      message({ from: "120363999999999@g.us", body: "hey ResearchBot can you check this?" }),
      {
        agentName: "ResearchBot",
        autoReply: true,
        dmPolicy: "always",
        groupPolicy: "mention",
      },
    );

    expect(decision).toEqual({ shouldReply: true, reason: "group_mention" });
  });

  it("captures but does not reply to unmentioned group messages under mention policy", () => {
    const decision = evaluateWhatsAppReplyRules(
      message({ from: "120363999999999@g.us", body: "normal group chatter" }),
      {
        agentName: "ResearchBot",
        autoReply: true,
        dmPolicy: "always",
        groupPolicy: "mention",
      },
    );

    expect(decision).toEqual({ shouldReply: false, reason: "group_not_mentioned" });
  });
});
