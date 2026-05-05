import { describe, expect, it } from "vitest";
import type { BaileysWebhook } from "./channels";
import { formatWhatsAppInboundMessageForModel, parseWhatsAppWebhook } from "./channels";

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
      pushName: "John",
      ...overrides,
    },
  };
}

describe("formatWhatsAppInboundMessageForModel", () => {
  it("formats DM messages with sender identity", () => {
    const message = parseWhatsAppWebhook(webhook());

    expect(formatWhatsAppInboundMessageForModel(message)).toContain("[whatsapp dm]");
    expect(formatWhatsAppInboundMessageForModel(message)).toContain(
      "from: 15551234567@s.whatsapp.net",
    );
    expect(formatWhatsAppInboundMessageForModel(message)).toContain("name: John");
    expect(formatWhatsAppInboundMessageForModel(message)).toContain("hello");
  });

  it("formats group messages with participant identity", () => {
    const message = parseWhatsAppWebhook(
      webhook({
        from: "120363999999999@g.us",
        isGroup: true,
        participant: "16667778888@s.whatsapp.net",
        pushName: "Alice",
        body: "group message",
      }),
    );

    expect(formatWhatsAppInboundMessageForModel(message)).toContain("[whatsapp group]");
    expect(formatWhatsAppInboundMessageForModel(message)).toContain("group: 120363999999999@g.us");
    expect(formatWhatsAppInboundMessageForModel(message)).toContain(
      "sender: 16667778888@s.whatsapp.net",
    );
    expect(formatWhatsAppInboundMessageForModel(message)).toContain("name: Alice");
    expect(formatWhatsAppInboundMessageForModel(message)).toContain("group message");
  });
});
