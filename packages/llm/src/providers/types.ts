/**
 * Generic chat-turn shape shared by all providers. Adapters translate this to
 * and from their own SDK's native request/response shape (Gemini's
 * contents/parts, Groq's OpenAI-compatible chat array, Anthropic's
 * MessageParam[]) so the gateway's retry/logging loop stays provider-agnostic.
 */
export interface ProviderMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ProviderCallInput {
  model: string;
  maxTokens: number;
  system: string;
  messages: ProviderMessage[];
}

export interface ProviderCallOutput {
  text: string;
  /** Echoed back so the gateway logs the model that actually served the response. */
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export type ProviderName = "anthropic" | "gemini" | "groq";

export interface LlmProvider {
  readonly name: ProviderName;
  readonly defaultModel: string;
  call(input: ProviderCallInput): Promise<ProviderCallOutput>;
  /** USD per 1M tokens semantics (= micro-USD/token), same convention across providers. */
  costMicroUsd(model: string, inputTokens: number, outputTokens: number): number;
}
