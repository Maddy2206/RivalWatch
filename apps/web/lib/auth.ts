import { loadEnv, requireEnv } from "@rivalwatch/config";
import { getDb, schema } from "@rivalwatch/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

export const auth = betterAuth({
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  secret: requireEnv("BETTER_AUTH_SECRET"),
  baseURL: loadEnv().BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
  },
  // Dev convenience: if another process squats port 3000, Next.js silently
  // falls back to 3001/3002/etc., which no longer matches BETTER_AUTH_URL
  // and better-auth rejects the request as "invalid origin". Trust a small
  // range of localhost dev ports so a stray port doesn't break auth outright
  // (production only ever sets BETTER_AUTH_URL itself).
  trustedOrigins:
    loadEnv().NODE_ENV === "production"
      ? undefined
      : Array.from({ length: 10 }, (_, i) => `http://localhost:${3000 + i}`),
  // Must be last: lets server actions and route handlers set session cookies
  // correctly under Next.js's cookie-mutation rules.
  plugins: [nextCookies()],
});
