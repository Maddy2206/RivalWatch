import { loadEnv } from "@rivalwatch/config";
import { RivalWatchError } from "@rivalwatch/core";
import { Queue, UnrecoverableError, Worker } from "bullmq";
import IORedis from "ioredis";

import type { WorkerDeps } from "../deps.js";
import { handleAlert } from "../handlers/alert.js";
import { handleClassify } from "../handlers/classify.js";
import { handleCrawl } from "../handlers/crawl.js";
import { handleDiff } from "../handlers/diff.js";
import { handleExtract } from "../handlers/extract.js";
import { QUEUE_SCHEMAS, type QueueJob, type QueueName } from "./schemas.js";

const QUEUE_PREFIX = "rivalwatch";

export function makeRedisConnection(): IORedis {
  return new IORedis(loadEnv().REDIS_URL, { maxRetriesPerRequest: null });
}

export function makeQueues(connection: IORedis): Record<QueueName, Queue> {
  const options = {
    connection,
    prefix: QUEUE_PREFIX,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential" as const, delay: 30_000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  };
  return {
    crawl: new Queue("crawl", options),
    extract: new Queue("extract", options),
    diff: new Queue("diff", options),
    classify: new Queue("classify", options),
    alert: new Queue("alert", options),
  };
}

/** Enqueue with payload validation (invariant: validate on enqueue AND consume). */
export function makeEnqueue(queues: Record<QueueName, Queue>) {
  return async (job: QueueJob, opts?: { delayMs?: number }): Promise<void> => {
    const payload = QUEUE_SCHEMAS[job.queue].parse(job.payload);
    await queues[job.queue].add(job.queue, payload, { delay: opts?.delayMs });
  };
}

type Handler = (deps: WorkerDeps, payload: never) => Promise<void>;

const HANDLERS: Record<QueueName, Handler> = {
  crawl: handleCrawl as Handler,
  extract: handleExtract as Handler,
  diff: handleDiff as Handler,
  classify: handleClassify as Handler,
  alert: handleAlert as Handler,
};

/**
 * Start one BullMQ worker per queue. The top-level handler validates the
 * payload again and converts non-retryable typed errors into
 * UnrecoverableError so BullMQ dead-letters them instead of hammering retries
 * (e.g. a robots.txt disallow must never be retried).
 */
export function startWorkers(connection: IORedis, deps: WorkerDeps): Worker[] {
  return (Object.keys(HANDLERS) as QueueName[]).map((name) => {
    const worker = new Worker(
      name,
      async (job) => {
        const payload = QUEUE_SCHEMAS[name].parse(job.data);
        try {
          await HANDLERS[name](deps, payload as never);
        } catch (error) {
          if (error instanceof RivalWatchError && !error.retryable) {
            throw new UnrecoverableError(`${error.name}: ${error.message}`);
          }
          throw error;
        }
      },
      {
        connection,
        prefix: QUEUE_PREFIX,
        // Politeness invariant 5: a single crawl at a time keeps per-domain
        // concurrency at 1 (revisit with a per-domain lock when scaling out).
        concurrency: name === "crawl" ? 1 : 5,
      },
    );
    worker.on("failed", (job, error) => {
      deps.log(`worker[${name}]: job ${job?.id} failed (${job?.attemptsMade} attempts): ${error.message}`);
    });
    return worker;
  });
}
