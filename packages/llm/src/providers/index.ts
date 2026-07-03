import { resolveLlmProvider } from "@rivalwatch/config";

import { anthropicProvider } from "./anthropic.js";
import { geminiProvider } from "./gemini.js";
import { groqProvider } from "./groq.js";
import type { LlmProvider, ProviderName } from "./types.js";

const registry: Record<ProviderName, LlmProvider> = {
  anthropic: anthropicProvider,
  gemini: geminiProvider,
  groq: groqProvider,
};

export function getProvider(): LlmProvider {
  return registry[resolveLlmProvider()];
}

export type {
  LlmProvider,
  ProviderCallInput,
  ProviderCallOutput,
  ProviderMessage,
  ProviderName,
} from "./types.js";
