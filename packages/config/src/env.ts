import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// dotenv loads an unset `KEY=` line as "", not undefined — normalize blank
// strings to undefined so `.optional()` fields behave as actually-optional.
const optionalString = () =>
  z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).optional());
const optionalUrl = () =>
  z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional());

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  // Optional integrations: features that need them call requireEnv() and
  // fail with a clear error instead of failing every boot.
  ANTHROPIC_API_KEY: optionalString(),
  GEMINI_API_KEY: optionalString(),
  GROQ_API_KEY: optionalString(),
  RESEND_API_KEY: optionalString(),
  /** Defaults to Resend's shared onboarding@resend.dev sender if unset (no domain verification needed for dev). */
  RESEND_FROM_EMAIL: optionalString(),
  R2_ACCOUNT_ID: optionalString(),
  R2_ACCESS_KEY_ID: optionalString(),
  R2_SECRET_ACCESS_KEY: optionalString(),
  R2_BUCKET: optionalString(),
  LEMONSQUEEZY_API_KEY: optionalString(),
  LEMONSQUEEZY_WEBHOOK_SECRET: optionalString(),
  LEMONSQUEEZY_STORE_ID: optionalString(),
  LEMONSQUEEZY_STARTER_VARIANT_ID: optionalString(),
  LEMONSQUEEZY_PRO_VARIANT_ID: optionalString(),
  BETTER_AUTH_SECRET: optionalString(),
  BETTER_AUTH_URL: optionalUrl(),

  STORAGE_DIR: z.string().default(".storage"),
  /** auto = Playwright when available, plain HTTP otherwise. */
  CRAWL_MODE: z.enum(["auto", "playwright", "http"]).default("auto"),
  /** auto = anthropic (if paid key set) > gemini > groq, first configured wins. */
  LLM_PROVIDER: z.enum(["auto", "anthropic", "gemini", "groq"]).default("auto"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

export class MissingEnvError extends Error {
  constructor(name: string) {
    super(`Missing required environment variable: ${name}`);
    this.name = "MissingEnvError";
  }
}

/** Walk up from this file to find the repo root .env (monorepo root). */
function findRootEnvFile(): string | undefined {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }
  return undefined;
}

let cached: Env | undefined;

/**
 * Parse and validate process.env once. Fails fast (throws) on invalid or
 * missing required vars. Call at app boot.
 */
export function loadEnv(): Env {
  if (cached) return cached;
  const envFile = findRootEnvFile();
  if (envFile) loadDotenv({ path: envFile });
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test-only: clear the cached parsed env so the next loadEnv() re-reads process.env. */
export function resetEnvCacheForTesting(): void {
  cached = undefined;
}

/** Get an optional env var or throw MissingEnvError — for feature-gated integrations. */
export function requireEnv<K extends keyof Env>(name: K): NonNullable<Env[K]> {
  const value = loadEnv()[name];
  if (value === undefined || value === "") throw new MissingEnvError(name);
  return value as NonNullable<Env[K]>;
}

/** True when all R2 vars are present; otherwise the local fs storage adapter is used. */
export function hasR2Config(): boolean {
  const env = loadEnv();
  return Boolean(
    env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET,
  );
}

export type LlmProviderName = "anthropic" | "gemini" | "groq";

/**
 * auto priority: anthropic (paid key = intentional upgrade to the highest-quality
 * model) > gemini (chosen zero-cost default) > groq (secondary free fallback).
 * First provider whose key is present wins.
 */
export function resolveLlmProvider(): LlmProviderName {
  const env = loadEnv();
  if (env.LLM_PROVIDER !== "auto") return env.LLM_PROVIDER;
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  if (env.GEMINI_API_KEY) return "gemini";
  if (env.GROQ_API_KEY) return "groq";
  throw new MissingEnvError(
    "LLM_PROVIDER=auto requires one of ANTHROPIC_API_KEY, GEMINI_API_KEY, or GROQ_API_KEY",
  );
}

/** True when some LLM provider is usable — mirrors hasR2Config()'s feature-gate role. */
export function hasLlmProviderConfigured(): boolean {
  try {
    resolveLlmProvider();
    return true;
  } catch {
    return false;
  }
}

/** True when Resend is usable — gates alert/brief email sending. */
export function hasResendConfigured(): boolean {
  return Boolean(loadEnv().RESEND_API_KEY);
}

/** True when checkout can be created — all three Lemon Squeezy IDs plus the API key must be set. */
export function hasLemonSqueezyConfigured(): boolean {
  const env = loadEnv();
  return Boolean(
    env.LEMONSQUEEZY_API_KEY &&
      env.LEMONSQUEEZY_STORE_ID &&
      env.LEMONSQUEEZY_STARTER_VARIANT_ID &&
      env.LEMONSQUEEZY_PRO_VARIANT_ID,
  );
}
