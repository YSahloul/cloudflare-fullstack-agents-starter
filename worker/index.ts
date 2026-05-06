import { getLogger } from "@logtape/logtape";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger as honoLogger } from "hono/logger";
import { coreApi } from "./routes/api";
import { whatsappRouter } from "./routes/whatsapp";

// Initialize logger
import "./lib/logger";
import { LOGGER_NAME } from "./constants";
import { createAuth } from "./lib/auth/auth";
import { authProvider } from "./lib/auth/provider";
import { prepareErrorForLogging } from "./lib/errors";
import type { HonoAppType } from "./types";

const logger = getLogger(LOGGER_NAME);

const app = new Hono<HonoAppType>()
  .use(honoLogger((str, ...args) => logger.debug(str, { args })))
  .use(authProvider)
  .on(["POST", "GET"], "/api/auth/*", (c) => {
    logger.debug("Auth request", { url: c.req.url });
    const auth = createAuth(c.env);
    return auth.handler(c.req.raw);
  })
  .route("/api/v1", coreApi)
  .route("/api/whatsapp", whatsappRouter);

app.onError((error, c) => {
  logger.error("API Error", { error: prepareErrorForLogging(error) });

  if (error instanceof HTTPException) {
    return c.json(
      {
        message: error.message,
      },
      error.status,
    );
  }

  return c.json(
    {
      message: "Something went wrong",
    },
    500,
  );
});

export default app;

export { WhatsAppBotAgent } from "./whatsapp/agent";
