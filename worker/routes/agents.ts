import { zValidator } from "@hono/zod-validator";
import { getLogger } from "@logtape/logtape";
import { routeAgentRequest } from "agents";
import { Hono } from "hono";
import { createFactory } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono/validator";
import { z } from "zod";
import { CF_AGENTS_ROUTING_PREFIX, LOGGER_NAME } from "../constants";
import {
  archivePersonalAgent,
  createPersonalAgent,
  getPersonalAgentById,
  listPersonalAgentsByUserId,
  updatePersonalAgent,
} from "../db/queries/personal-agents";
import { authorizePersonalAgentForUser } from "../lib/auth/authorization";
import { dbProvider } from "../lib/dbProvider";
import type { HonoAppType } from "../types";

const logger = getLogger([LOGGER_NAME, "api"]);

const factory = createFactory<HonoAppType>();

/**
 * Create a typesafe handler that can be reused and mounted at multiple Hono routes
 *
 * Validates path parameters to be able to access them type-safely in the handler
 *
 * @note - We do this to support the routing of the agents sdk, which requires that
 *         we support both `/agents/:agentName/:agentId` and `/agents/:agentName/:agentId/**`
 *         the latter of which is necessary to support auth of MCP servers.
 */
const agentsHandlers = factory.createHandlers(
  dbProvider,
  validator("param", (value, _c) => {
    const { agentId, agentName } = value;

    if (typeof agentId !== "string" || typeof agentName !== "string") {
      throw new HTTPException(400, {
        message: "Invalid agent identifiers in the path",
      });
    }

    return {
      agentId,
      agentName,
    };
  }),
  async (c) => {
    const db = c.var.db;
    const user = c.get("user");
    const { agentId } = c.req.valid("param");

    // The agentId IS the personalAgentId (agents SDK routing convention)
    const personalAgent = await getPersonalAgentById(db, agentId);

    if (!personalAgent) {
      logger.warn("[Agent Route] Personal agent not found", { agentId });
      throw new HTTPException(404, { message: "Personal agent not found" });
    }

    // Verify the personal agent belongs to the user
    authorizePersonalAgentForUser(user, personalAgent);

    const agentStubId = c.env.PersonalAgent.idFromName(personalAgent.id);
    const agentStub = c.env.PersonalAgent.get(agentStubId);

    // Set the name on the stub to fix "Attempting to read .name" error
    // We need to do this because when we hydrate, we automatically try to connect to MCP servers
    //
    // See also: https://github.com/cloudflare/workerd/issues/2240
    await agentStub.setName?.(personalAgent.id);

    // Hydrate the agent with the personal agent data
    await agentStub.hydrate({
      personalAgentId: personalAgent.id,
      personalAgentName: personalAgent.agentName,
      userId: user.id,
    });

    // Send the request to the agent
    const agentResponse = await routeAgentRequest(c.req.raw, c.env, {
      prefix: CF_AGENTS_ROUTING_PREFIX,
    });

    if (agentResponse) {
      return agentResponse;
    }

    return c.json({ message: "Agent not found" }, { status: 404 });
  },
);

export const agentsRouter = new Hono<HonoAppType>()
  .use("*", dbProvider)
  .post(
    "/personal-agents",
    validator("json", (value) => {
      const { agentName, systemPrompt, model, temperature, maxTokens } = value as {
        agentName?: unknown;
        systemPrompt?: unknown;
        model?: unknown;
        temperature?: unknown;
        maxTokens?: unknown;
      };

      if (typeof agentName !== "string" || !agentName) {
        throw new HTTPException(400, {
          message: "agentName is required and must be a string",
        });
      }

      return {
        agentName,
        systemPrompt: typeof systemPrompt === "string" ? systemPrompt : undefined,
        model: typeof model === "string" ? model : undefined,
        temperature: typeof temperature === "number" ? temperature : undefined,
        maxTokens: typeof maxTokens === "number" ? maxTokens : undefined,
      };
    }),
    async (c) => {
      const db = c.var.db;
      const user = c.get("user");
      const { agentName, systemPrompt, model, temperature, maxTokens } = c.req.valid("json");

      if (!user) {
        throw new HTTPException(401, { message: "Unauthorized" });
      }

      const personalAgent = await createPersonalAgent(db, {
        userId: user.id,
        agentName,
        systemPrompt,
        model,
        temperature,
        maxTokens,
      });

      return c.json(personalAgent, 201);
    },
  )
  .get("/personal-agents", async (c) => {
    const db = c.var.db;
    const user = c.get("user");

    if (!user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const personalAgents = await listPersonalAgentsByUserId(db, user.id);

    return c.json(personalAgents);
  })
  .get("/personal-agents/:id", dbProvider, async (c) => {
    const db = c.var.db;
    const user = c.get("user");
    const { id } = c.req.param();

    const personalAgent = await getPersonalAgentById(db, id);

    if (!personalAgent) {
      throw new HTTPException(404, { message: "Personal agent not found" });
    }

    // Verify the personal agent belongs to the user
    authorizePersonalAgentForUser(user, personalAgent);

    return c.json(personalAgent);
  })
  .patch(
    "/personal-agents/:id",
    dbProvider,
    zValidator(
      "json",
      z.object({
        agentName: z.string().min(3, "agentName is required"),
        systemPrompt: z.string().nullable().optional(),
        model: z.string().min(1).nullable().optional(),
        temperature: z.number().nullable().optional(),
        maxTokens: z.number().nullable().optional(),
      }),
    ),
    async (c) => {
      const db = c.var.db;
      const user = c.get("user");
      const { id } = c.req.param();
      const { agentName, systemPrompt, model, temperature, maxTokens } = c.req.valid("json");

      // Get existing personal agent
      const existingPersonalAgent = await getPersonalAgentById(db, id);

      if (!existingPersonalAgent) {
        throw new HTTPException(404, { message: "Personal agent not found" });
      }

      // Verify the personal agent belongs to the user
      authorizePersonalAgentForUser(user, existingPersonalAgent);

      // Update the personal agent in D1
      const updatedPersonalAgent = await updatePersonalAgent(db, id, {
        agentName,
        systemPrompt,
        model,
        temperature,
        maxTokens,
      });

      // Update the durable object with new data
      const agentStubId = c.env.PersonalAgent.idFromName(id);
      const agentStub = c.env.PersonalAgent.get(agentStubId);

      // Hydrate the durable object with updated data
      // This will also re-register the MCP server if the URL has changed
      await agentStub.hydrate({
        personalAgentId: id,
        personalAgentName: updatedPersonalAgent.agentName,
        userId: user.id,
      });

      return c.json(updatedPersonalAgent);
    },
  )
  .delete("/personal-agents/:id", dbProvider, async (c) => {
    const db = c.var.db;
    const user = c.get("user");
    const { id } = c.req.param();

    const personalAgent = await getPersonalAgentById(db, id);

    if (!personalAgent) {
      throw new HTTPException(404, { message: "Personal agent not found" });
    }

    // Verify the personal agent belongs to the user
    authorizePersonalAgentForUser(user, personalAgent);

    // Archive the personal agent instead of deleting
    const archivedPersonalAgent = await archivePersonalAgent(db, id);

    return c.json(archivedPersonalAgent);
  })
  .all("/:agentName/:agentId", ...agentsHandlers)
  .all("/:agentName/:agentId/*", ...agentsHandlers);
