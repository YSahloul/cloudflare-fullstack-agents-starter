import { describe, expect, it, vi } from "vitest";

// Mock the env-utils module before importing allow-list
vi.mock("../env-utils", () => ({
  isDevelopmentEnv: vi.fn(() => false),
}));

import { allowListMiddleware } from "./allow-list";

describe("allowListMiddleware", () => {
  it("should allow authenticated users through", async () => {
    const c = {
      req: { url: "https://example.com/api/whatsapp/agents" },
      get: vi.fn(() => ({ id: "user-1", email: "test@example.com" })),
    } as any;
    const next = vi.fn();

    await allowListMiddleware(c, next);
    expect(next).toHaveBeenCalled();
  });

  it("should block unauthenticated users", async () => {
    const c = {
      req: { url: "https://example.com/api/whatsapp/agents" },
      get: vi.fn(() => null),
    } as any;
    const next = vi.fn();

    await expect(allowListMiddleware(c, next)).rejects.toThrow("Unauthorized");
    expect(next).not.toHaveBeenCalled();
  });

  it("should skip auth routes", async () => {
    const c = {
      req: { url: "https://example.com/api/auth/sign-in" },
      get: vi.fn(() => null),
    } as any;
    const next = vi.fn();

    await allowListMiddleware(c, next);
    expect(next).toHaveBeenCalled();
  });
});
