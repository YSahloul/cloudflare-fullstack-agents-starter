import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono/validator";
import { z } from "zod";
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
;
