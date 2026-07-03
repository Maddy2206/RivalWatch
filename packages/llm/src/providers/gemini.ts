/** The only file that may import @google/genai. */
import { requireEnv } from "@rivalwatch/config";
import { GoogleGenAI } from "@google/genai";

import type { LlmProvider, ProviderCallInput, ProviderCallOutput } from "./types.js";

/** USD per 1M tokens. gemini-2.5-flash is genuinely free-tier today, not a placeholder. */
const PRICING: Record<string, { input: number; output: number }> = {
  "gemini-2.5-flash": { input: 0, output: 0 },
};

let client: GoogleGenAI | undefined;

function getClient(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY") });
  return client;
}

async function call(input: ProviderCallInput): Promise<ProviderCallOutput> {
  const ai = getClient();

  const contents = input.messages.map((m) => ({
    role: m.role === "assistant" ? ("model" as const) : ("user" as const),
    parts: [{ text: m.content }],
  }));

  const response = await ai.models.generateContent({
    model: input.model,
    contents,
    config: {
      systemInstruction: input.system,
      maxOutputTokens: input.maxTokens,
    },
  });

  return {
    text: response.text ?? "",
    model: input.model,
    inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

function costMicroUsd(model: string, inputTokens: number, outputTokens: number): number {
  const rate = PRICING[model];
  if (!rate) return 0;
  return Math.round(inputTokens * rate.input + outputTokens * rate.output);
}

export const geminiProvider: LlmProvider = {
  name: "gemini",
  defaultModel: "gemini-2.5-flash",
  call,
  costMicroUsd,
};
