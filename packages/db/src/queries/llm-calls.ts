import type { Db } from "../client.js";
import { llmCalls } from "../schema.js";

export interface LlmCallLog {
  purpose: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costMicroUsd: number;
  latencyMs: number;
  success: boolean;
  error?: string;
}

export async function insertLlmCall(db: Db, log: LlmCallLog): Promise<void> {
  await db.insert(llmCalls).values({ ...log, error: log.error ?? null });
}
