import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { HonoAppType } from "../../types";

/**
 * Simple auth check — any authenticated user can access.
 * The old GitHub allow-list was removed so real users can sign up and use the app.
 */
export const allowListMiddleware = createMiddleware<HonoAppType>(async (c, next) => {
  // Skip auth routes - they need to work without authentication
  const path = new URL(c.req.url).pathname;
  if (path.startsWith("/api/auth/")) {
    return next();
  }

  const user = c.get("user");

  if (!user) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }

  await next();
});
