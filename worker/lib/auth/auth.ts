import { getLogger } from "@logtape/logtape";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import { LOGGER_NAME } from "@/worker/constants";
import { account, session, user, verification } from "../../db/schema";

const logger = getLogger([LOGGER_NAME, "auth"]);

/**
 * Create a Better Auth instance.
 * - Has a `socialProviders` config for GitHub
 * - Has a `plugins` config for the MCP plugin, which redirects to the `/login` route
 * - Disables email/password auth
 *
 * @TODO - Determine the proper cookie prefix, if any
 * @TODO - Investigate usage of OIDC consent screen
 */
export const createAuth = (env: CloudflareBindings) => {
  const db = drizzle(env.DB);

  return betterAuth({
    user: {
      additionalFields: {
        githubUsername: {
          type: "string", // Match the type in your database
          required: false, // Or true, if every user must have it
        },
      },
      deleteUser: {
        enabled: true,
      },
    },
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        /**
         * @NOTE - It would probably be smarter to `import * as authSchema from "../db/auth-schema";`,
         *         then we can just pass `authSchema` to the `drizzleAdapter` config.
         *         However, I like being explicit about what we're importing for now. For future readers!
         */
        user: user,
        session: session,
        account: account,
        verification: verification,
      },
    }),
    socialProviders: {
      ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
        ? {
            github: {
              clientId: env.GITHUB_CLIENT_ID,
              clientSecret: env.GITHUB_CLIENT_SECRET,
              mapProfileToUser: (profile: { login: string }) => {
                return {
                  githubUsername: profile.login,
                };
              },
            },
          }
        : {}),
      ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            },
          }
        : {}),
    },
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      minPasswordLength: 6,
    },
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // 1 day (update session if older than this)
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5, // 5 minutes - cache session in cookie to reduce DB lookups
      },
    },
    advanced: {
      cookiePrefix: "fpc",
    },
    logger: {
      level: "debug", // Options: "error", "warn", "info", "debug"
      log: (level, message, ...args) => {
        const serializedArgs = args.map((arg) => {
          if (typeof arg === "object" && arg !== null) {
            try {
              // Create a Set to track visited objects and prevent circular references
              const seen = new WeakSet();
              return JSON.stringify(
                arg,
                (_key, value) => {
                  if (typeof value === "object" && value !== null) {
                    if (seen.has(value)) {
                      return "[Circular Reference]";
                    }
                    seen.add(value);
                  }
                  return value;
                },
                2,
              );
            } catch (error) {
              return `[Object serialization failed: ${error instanceof Error ? error.message : "Unknown error"}]`;
            }
          }
          return arg;
        });
        logger.debug(`[BetterAuth][${level}] ${message}`, { args: serializedArgs });
      },
    },
  });
};

export type Auth = ReturnType<typeof createAuth>;
