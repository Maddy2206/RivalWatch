/** The only file that may import @anthropic-ai/sdk. */
import Anthropic from "@anthropic-ai/sdk";
import { requireEnv } from "@rivalwatch/config";

import type { LlmProvider, ProviderCallInput, ProviderCallOutput } from "./types.js";

/** USD per 1M tokens → equals micro-USD per token. */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-opus-4-8": { input: 5, output: 25 },
};

let client: Anthropic | undefined;

function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  return client;
}

async function call(input: ProviderCallInput): Promise<ProviderCallOutput> {
  const anthropic = getClient();
  const messages: Anthropic.MessageParam[] = input.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const response = await anthropic.messages.create({
    model: input.model,
    max_tokens: input.maxTokens,
    // Classification/synthesis calls are cheap structured tasks; skip thinking.
    thinking: { type: "disabled" },
    system: input.system,
    messages,
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  return {
    text,
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

function costMicroUsd(model: string, inputTokens: number, outputTokens: number): number {
  const rate = PRICING[model];
  if (!rate) return 0;
  return Math.round(inputTokens * rate.input + outputTokens * rate.output);
}

export const anthropicProvider: LlmProvider = {
  name: "anthropic",
  defaultModel: "claude-sonnet-5",
  call,
  costMicroUsd,
};
