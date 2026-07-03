/**
 * The single entrypoint for all LLM calls (repo invariant 1). Provider SDKs
 * are only imported inside packages/llm/src/providers/*.ts; this file just
 * dispatches to whichever provider LLM_PROVIDER/available keys resolve to
 * (see @rivalwatch/config's resolveLlmProvider). Every call carries a
 * `purpose` and a zod schema, returns strict validated JSON (one retry on
 * parse/validation failure, then throws — invariant 8), and logs
 * tokens/cost/latency to the llm_calls table.
 */
import { LlmParseError } from "@rivalwatch/core";
import { getDb, insertLlmCall } from "@rivalwatch/db";
import type { z } from "zod";

import { getProvider, type ProviderMessage } from "./providers/index.js";

export interface GatewayCall<T> {
  /** Logged with every call; e.g. "classify-change", "weekly-brief". */
  purpose: string;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
}

function extractJson(raw: string): string {
  // Models occasionally wrap JSON in code fences despite instructions.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced?.[1] ?? raw).trim();
}

export async function call<T>(opts: GatewayCall<T>): Promise<T> {
  const provider = getProvider();
  const model = opts.model ?? provider.defaultModel;
  const maxTokens = opts.maxTokens ?? 1024;
  const db = getDb();

  const messages: ProviderMessage[] = [{ role: "user", content: opts.prompt }];
  let lastError = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const started = Date.now();
    let output;
    try {
      output = await provider.call({
        model,
        maxTokens,
        system: `${opts.system}\n\nRespond with ONLY a single valid JSON object. No prose, no code fences.`,
        messages,
      });
    } catch (error) {
      await insertLlmCall(db, {
        purpose: opts.purpose,
        model,
        inputTokens: 0,
        outputTokens: 0,
        costMicroUsd: 0,
        latencyMs: Date.now() - started,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    let parsed: T | undefined;
    try {
      const result = opts.schema.safeParse(JSON.parse(extractJson(output.text)));
      if (result.success) parsed = result.data;
      else lastError = result.error.message;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await insertLlmCall(db, {
      purpose: opts.purpose,
      model: output.model,
      inputTokens: output.inputTokens,
      outputTokens: output.outputTokens,
      costMicroUsd: provider.costMicroUsd(model, output.inputTokens, output.outputTokens),
      latencyMs: Date.now() - started,
      success: parsed !== undefined,
      error: parsed === undefined ? `parse failure: ${lastError.slice(0, 500)}` : undefined,
    });

    if (parsed !== undefined) return parsed;

    // One retry with the failure fed back (invariant 8).
    messages.push(
      { role: "assistant", content: output.text || "(empty response)" },
      {
        role: "user",
        content: `Your previous response was not valid JSON matching the required schema (${lastError.slice(0, 300)}). Respond again with ONLY the corrected JSON object.`,
      },
    );
  }

  throw new LlmParseError(
    `LLM returned invalid JSON for purpose "${opts.purpose}" after retry: ${lastError.slice(0, 300)}`,
  );
}
