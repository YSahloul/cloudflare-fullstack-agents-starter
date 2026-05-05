import { getLogger } from "@logtape/logtape";
import { type Connection, callable, type WSMessage } from "agents";
import { AIChatAgent } from "agents/ai-chat-agent";
import type { StreamTextOnFinishCallback, ToolSet } from "ai";
import { convertToModelMessages, stepCountIs, streamText } from "ai";
import { type DrizzleSqliteDODatabase, drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import { CF_AGENTS_ROUTING_PREFIX, LOGGER_NAME } from "../constants";
import { prepareErrorForLogging } from "../lib/errors";
import { createAiModel, getAiGatewayName } from "./ai";
import { SHOULD_LOG_DRIZZLE_QUERIES } from "./config";
import { createObservability } from "./services/observability";
import { drizzleLogger, migrations, schema } from "./storage";
import { isConnection } from "./utils";

/** Application logger for the PersonalAgent */
const logger = getLogger([LOGGER_NAME, "personal-agent"]);

export class PersonalAgent extends AIChatAgent<CloudflareBindings> {
  waitForMcpConnections = true;
  db: DrizzleSqliteDODatabase<typeof schema>;
  /** The id of the record in D1 that this agent is associated with */
  personalAgentId: string | null;
  /** The name of the agent */
  personalAgentName: string | null;
  /** The user id that this agent is associated with */
  userId: string | null;
  agentSystemPrompt: string | null;
  agentModel: string | null;
  agentTemperature: number | null;
  agentMaxTokens: number | null;

  constructor(ctx: DurableObjectState, env: CloudflareBindings) {
    super(ctx, env);

    this.db = drizzle(ctx.storage, {
      schema,
      logger: SHOULD_LOG_DRIZZLE_QUERIES ? drizzleLogger : false,
    });

    // Initialize persisted metadata here, then fetch in blockConcurrencyWhile
    this.personalAgentId = null;
    this.personalAgentName = null;
    this.userId = null;
    this.agentSystemPrompt = null;
    this.agentModel = null;
    this.agentTemperature = null;
    this.agentMaxTokens = null;

    // Set up MCP observability listener to capture connection events
    this.observability = createObservability(logger);
    logger.debug("[MCP Observability] Observability handler configured");

    ctx.blockConcurrencyWhile(async () => {
      this.personalAgentId = (await ctx.storage.get("personalAgentId")) ?? null;
      this.personalAgentName = (await ctx.storage.get("personalAgentName")) ?? null;
      this.userId = (await ctx.storage.get("userId")) ?? null;
      this.agentSystemPrompt = (await ctx.storage.get("agentSystemPrompt")) ?? null;
      this.agentModel = (await ctx.storage.get("agentModel")) ?? null;
      this.agentTemperature = (await ctx.storage.get("agentTemperature")) ?? null;
      this.agentMaxTokens = (await ctx.storage.get("agentMaxTokens")) ?? null;

      // Run drizzle migrations
      await migrate(this.db, migrations);
    });
  }

  /**
   * A method to "hydrate" the agent with data.
   * Typically, this should be called from the API before sending a request to the agent.
   *
   * Gives us a chance to set up the Agent with information it needs
   * in order to correlate its work with the outside world (our D1 database, etc)
   */
  async hydrate({
    personalAgentId,
    personalAgentName,
    userId,
    systemPrompt,
    model,
    temperature,
    maxTokens,
  }: {
    personalAgentId: string;
    personalAgentName: string;
    userId: string;
    systemPrompt?: string | null;
    model?: string | null;
    temperature?: number | null;
    maxTokens?: number | null;
  }): Promise<void> {
    this.personalAgentId = personalAgentId;
    this.personalAgentName = personalAgentName;
    this.userId = userId;
    this.agentSystemPrompt = systemPrompt ?? null;
    this.agentModel = model ?? null;
    this.agentTemperature = temperature ?? null;
    this.agentMaxTokens = maxTokens ?? null;
    await this.ctx.storage.put("personalAgentId", personalAgentId);
    await this.ctx.storage.put("personalAgentName", personalAgentName);
    await this.ctx.storage.put("userId", userId);
    await this.ctx.storage.put("agentSystemPrompt", this.agentSystemPrompt);
    await this.ctx.storage.put("agentModel", this.agentModel);
    await this.ctx.storage.put("agentTemperature", this.agentTemperature);
    await this.ctx.storage.put("agentMaxTokens", this.agentMaxTokens);
  }

  async onStart(): Promise<void> {
    this.configureMcpOAuthCallback();
  }

  private configureMcpOAuthCallback(): void {
    this.mcp.configureOAuthCallback({
      successRedirect: `${this.env.BETTER_AUTH_URL}/personal-agents/auth/success?personalAgentId=${encodeURIComponent(this.personalAgentId ?? "")}`,
      errorRedirect: `${this.env.BETTER_AUTH_URL}/personal-agents/auth/error`,
    });
  }

  /**
   * Ensure the configured MCP server is registered
   * Only registers if not already present
   *
   * @note - Only supports streamble http transport
   */
  async ensureMcpServerRegistered(
    name: string,
    url: string,
    headers?: Record<string, string>,
  ): Promise<void> {
    if (!url) {
      logger.warn("Cannot register MCP server: no URL provided");
      return;
    }

    logger.debug("[MCP Registration] Starting registration check", {
      name,
      url,
      personalAgentId: this.personalAgentId,
      userId: this.userId,
    });

    const serverState = this.getMcpServers();
    logger.debug("[MCP Registration] Current server state", {
      serverCount: Object.keys(serverState.servers).length,
      servers: Object.entries(serverState.servers).map(([id, server]) => ({
        id,
        url: server.server_url,
        state: server.state,
        hasAuthUrl: !!server.auth_url,
      })),
    });

    // Check if we've already registered this server
    const match = Object.values(serverState.servers).find((server) => server.server_url === url);
    if (match) {
      logger.debug("[MCP Registration] Server already registered", {
        url,
        state: match.state,
        authUrl: match.auth_url,
        capabilities: match.capabilities,
      });
      return;
    }

    // We can re-use the better auth url for the callback host, isn't that helpful?
    const callbackHost = this.env.BETTER_AUTH_URL;

    try {
      const result = await this.addMcpServer(name, url, callbackHost, CF_AGENTS_ROUTING_PREFIX, {
        transport: {
          type: "streamable-http",
          headers,
        },
      });

      logger.info("[MCP Registration] Server registered successfully", {
        url,
        resultId: result.id,
        authUrl: result.authUrl,
      });

      // Check the state after registration
      const updatedState = this.getMcpServers();
      const registeredServer = Object.values(updatedState.servers).find(
        (server) => server.server_url === url,
      );

      logger.info("[MCP Registration] Post-registration state", {
        url,
        serverState: registeredServer?.state,
        hasAuthUrl: !!registeredServer?.auth_url,
        capabilities: registeredServer?.capabilities,
      });
    } catch (error) {
      logger.error("[MCP Registration] Failed to register MCP server", {
        url,
        callbackHost,
        error: prepareErrorForLogging(error),
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        errorStack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  @callable({ description: "Add an MCP server to this personal agent" })
  async addMcpServerCallable(
    name: string,
    url: string,
    headers?: Record<string, string>,
  ): Promise<{ state: string; serverId?: string; authUrl?: string }> {
    const serverState = this.getMcpServers();
    const existingServer = Object.entries(serverState.servers).find(
      ([_serverId, server]) => server.server_url === url,
    );

    if (existingServer) {
      const [serverId, server] = existingServer;
      return {
        state: server.state,
        serverId,
        authUrl: server.auth_url ?? undefined,
      };
    }

    const callbackHost = this.env.BETTER_AUTH_URL;
    const result = await this.addMcpServer(name, url, callbackHost, CF_AGENTS_ROUTING_PREFIX, {
      transport: {
        type: "streamable-http",
        headers,
      },
    });

    return {
      state: result.state,
      serverId: result.id,
      authUrl: result.authUrl,
    };
  }

  @callable({ description: "Remove an MCP server from this personal agent" })
  async removeMcpServerCallable(serverId: string): Promise<boolean> {
    await this.removeMcpServer(serverId);
    return true;
  }

  @callable({ description: "Get MCP server state for this personal agent" })
  async getMcpServerListCallable(): Promise<ReturnType<PersonalAgent["getMcpServers"]>> {
    return this.getMcpServers();
  }

  /**
   * Remove an MCP server by its URL
   *
   * @param oldUrl - The URL of the server to remove
   * @returns void
   */
  async removeMcpServerByUrl(oldUrl?: string) {
    const url = oldUrl || this.personalAgentName;
    if (!url) {
      throw new Error("Cannot remove server: no URL provided");
    }

    const serverState = this.getMcpServers();
    const existingServer = Object.entries(serverState.servers).find(
      ([_id, server]) => server.server_url === url,
    );
    if (existingServer) {
      const [serverId, server] = existingServer;
      logger.info("[MCP] Removing existing server before reinitializing", {
        serverId,
        state: server.state,
      });

      try {
        await this.removeMcpServer(serverId);
      } catch (error) {
        logger.warn("[MCP] Failed to remove existing server, continuing anyway", {
          error: prepareErrorForLogging(error),
        });
      }
    }
  }

  /**
   * Utility method to get an MCP server by its URL
   */
  getMCPServerByUrl(url: string) {
    const serverState = this.getMcpServers();
    return Object.values(serverState.servers).find((server) => server.server_url === url);
  }

  private createConfiguredModel() {
    return createAiModel({
      anthropicApiKey: this.env.ANTHROPIC_API_KEY,
      openAiApiKey: this.env.OPENAI_API_KEY,
      gatewayAccountId: this.env.CLOUDFLARE_ACCOUNT_ID,
      gatewayName: getAiGatewayName(),
      gatewayMetadata: {
        personalAgentName: this.personalAgentName ?? "",
        personalAgentId: this.personalAgentId ?? "",
        userId: this.userId ?? "",
      },
    });
  }

  private buildResearchSystemPrompt(channel: "chat" | "whatsapp"): string {
    const basePrompt =
      this.agentSystemPrompt?.trim() ||
      [
        "You are a research and fact-check agent, not a casual conversational assistant.",
        "Your primary job is to verify claims, inspect linked posts/pages/videos when possible, and answer with evidence.",
      ].join(" ");

    const channelInstruction =
      channel === "whatsapp"
        ? "You are replying on WhatsApp. Keep the answer concise, mobile-friendly, and easy to skim."
        : "Keep the answer concise and evidence-first.";

    return [
      basePrompt,
      "If MCP scraper/search/browser tools are available, use them before making factual claims.",
      "Prefer primary sources and reputable reporting. Do not guess or hallucinate missing facts.",
      "When evidence is weak or incomplete, say Unverified.",
      "Return this exact structure:",
      "Truth meter: <True | Mostly true | Mixed | Misleading | False | Unverified>",
      "Summary: <1-3 sentences>",
      "Sources:",
      "- <source title> — <URL>",
      "- <source title> — <URL>",
      channelInstruction,
    ].join("\n\n");
  }

  async runResearch(query: string, channel: "chat" | "whatsapp" = "chat"): Promise<string> {
    const model = this.createConfiguredModel();
    const tools = this.mcp.getAITools() as unknown as ToolSet;

    const result = streamText({
      model,
      system: this.buildResearchSystemPrompt(channel),
      messages: [
        {
          role: "user",
          content: query,
        },
      ],
      tools,
      maxOutputTokens: this.agentMaxTokens ?? 900,
      temperature: (this.agentTemperature ?? 20) / 100,
      stopWhen: stepCountIs(20),
    });

    return (await result.text).trim();
  }

  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal },
  ) {
    const model = this.createConfiguredModel();
    const messages = convertToModelMessages(this.messages);
    const tools = this.mcp.getAITools() as unknown as ToolSet;

    const response = streamText({
      model,
      system: this.buildResearchSystemPrompt("chat"),
      messages,
      tools,
      maxOutputTokens: this.agentMaxTokens ?? 900,
      temperature: (this.agentTemperature ?? 20) / 100,
      stopWhen: stepCountIs(20),
      onFinish,
      abortSignal: options?.abortSignal,
    });

    return response.toUIMessageStreamResponse();
  }

  /**
   * WebSocket message handling
   */
  async onMessage(connection: Connection, message: WSMessage) {
    await super.onMessage(connection, message);
  }

  override async fetch(request: Request): Promise<Response> {
    this.configureMcpOAuthCallback();
    return super.fetch(request);
  }

  /**
   * WebSocket error and disconnection (close) handling
   * @note - The strange type signature is due to overloads on this method in the Agent class
   * @todo - file an issue on the Cloudflare docs about the override here
   */
  async onError(connection: Connection | unknown, maybeError?: unknown): Promise<void> {
    const error = isConnection(connection) ? maybeError : connection;
    logger.error("WS error", { error: prepareErrorForLogging(error) });
  }

  /**
   * Handler that is called when the WebSocket connection is closed
   * Nice to see this in the logs sometimes
   */
  async onClose(
    connection: Connection,
    code: number,
    reason: string,
    wasClean: boolean,
  ): Promise<void> {
    logger.debug("WS closed", { code, reason, wasClean });
    connection.close();
  }
}
