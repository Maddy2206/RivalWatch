import { z } from "zod";

/**
 * Queue payloads, zod-validated on BOTH enqueue and consume so a bad producer
 * can never crash a consumer with an unexpected shape.
 */

export const crawlPayloadSchema = z.object({
  pageId: z.string().uuid(),
});
export type CrawlPayload = z.infer<typeof crawlPayloadSchema>;

export const extractPayloadSchema = z.object({
  pageId: z.string().uuid(),
  rawHtmlKey: z.string().min(1),
  httpStatus: z.number().int().nullable(),
});
export type ExtractPayload = z.infer<typeof extractPayloadSchema>;

export const diffPayloadSchema = z.object({
  snapshotId: z.string().uuid(),
});
export type DiffPayload = z.infer<typeof diffPayloadSchema>;

export const classifyPayloadSchema = z.object({
  changeId: z.string().uuid(),
});
export type ClassifyPayload = z.infer<typeof classifyPayloadSchema>;

export const alertPayloadSchema = z.object({
  changeId: z.string().uuid(),
});
export type AlertPayload = z.infer<typeof alertPayloadSchema>;

export const QUEUE_SCHEMAS = {
  crawl: crawlPayloadSchema,
  extract: extractPayloadSchema,
  diff: diffPayloadSchema,
  classify: classifyPayloadSchema,
  alert: alertPayloadSchema,
} as const;

export type QueueName = keyof typeof QUEUE_SCHEMAS;

export type QueueJob =
  | { queue: "crawl"; payload: CrawlPayload }
  | { queue: "extract"; payload: ExtractPayload }
  | { queue: "diff"; payload: DiffPayload }
  | { queue: "classify"; payload: ClassifyPayload }
  | { queue: "alert"; payload: AlertPayload };
