/** The only file that may import groq-sdk. */
import { requireEnv } from "@rivalwatch/config";
import Groq from "groq-sdk";

import type { LlmProvider, ProviderCallInput, ProviderCallOutput } from "./types.js";

/**
 * USD per 1M tokens — Groq's real paid-tier rate for llama-3.3-70b-versatile.
 * The same model serves both free and paid tiers (only rate limits differ),
 * so recording the real rate keeps llm_calls.costMicroUsd informative even
 * while nobody is billed yet, with no code change needed after upgrading.
 */
const PRICING: Record<string, { input: number; output: number }> = {
  "llama-3.3-70b-versatile": { input: 0.59, output: 0.79 },
};

let client: Groq | undefined;

function getClient(): Groq {
  if (!client) client = new Groq({ apiKey: requireEnv("GROQ_API_KEY") });
  return client;
}

async function call(input: ProviderCallInput): Promise<ProviderCallOutput> {
  const groq = getClient();

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: input.system },
    ...input.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const response = await groq.chat.completions.create({
    model: input.model,
    max_tokens: input.maxTokens,
    messages,
  });

  return {
    text: response.choices[0]?.message.content ?? "",
    model: response.model,
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
  };
}

function costMicroUsd(model: string, inputTokens: number, outputTokens: number): number {
  const rate = PRICING[model];
  if (!rate) return 0;
  return Math.round(inputTokens * rate.input + outputTokens * rate.output);
}

export const groqProvider: LlmProvider = {
  name: "groq",
  defaultModel: "llama-3.3-70b-versatile",
  call,
  costMicroUsd,
};
