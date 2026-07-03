import { describe, expect, it } from "vitest";

import {
  hasLlmProviderConfigured,
  MissingEnvError,
  resetEnvCacheForTesting,
  resolveLlmProvider,
} from "../src/env.js";

const REQUIRED_KEYS = ["DATABASE_URL", "REDIS_URL"];
const LLM_KEYS = ["LLM_PROVIDER", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY"];

/** Reset the env cache and process.env to a clean slate + the given overrides. */
function setEnv(overrides: Record<string, string | undefined>): void {
  resetEnvCacheForTesting();
  for (const key of [...REQUIRED_KEYS, ...LLM_KEYS]) delete process.env[key];
  process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";
  process.env.REDIS_URL = "redis://localhost:6379";
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("resolveLlmProvider (auto priority: anthropic > gemini > groq)", () => {
  it("prefers anthropic when both anthropic and gemini keys are set", () => {
    setEnv({ ANTHROPIC_API_KEY: "sk-ant", GEMINI_API_KEY: "gk" });
    expect(resolveLlmProvider()).toBe("anthropic");
  });

  it("falls back to gemini when only gemini and groq keys are set", () => {
    setEnv({ GEMINI_API_KEY: "gk", GROQ_API_KEY: "gq" });
    expect(resolveLlmProvider()).toBe("gemini");
  });

  it("falls back to groq when only the groq key is set", () => {
    setEnv({ GROQ_API_KEY: "gq" });
    expect(resolveLlmProvider()).toBe("groq");
  });

  it("honors an explicit LLM_PROVIDER override even if a higher-priority key is present", () => {
    setEnv({ LLM_PROVIDER: "groq", ANTHROPIC_API_KEY: "sk-ant", GROQ_API_KEY: "gq" });
    expect(resolveLlmProvider()).toBe("groq");
  });

  it("throws MissingEnvError when auto and no provider key is set", () => {
    setEnv({});
    expect(() => resolveLlmProvider()).toThrow(MissingEnvError);
  });
});

describe("hasLlmProviderConfigured", () => {
  it("returns true when a provider resolves", () => {
    setEnv({ GEMINI_API_KEY: "gk" });
    expect(hasLlmProviderConfigured()).toBe(true);
  });

  it("returns false when nothing is configured", () => {
    setEnv({});
    expect(hasLlmProviderConfigured()).toBe(false);
  });
});
