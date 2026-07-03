import type { Classification, ClassifyInput } from "@rivalwatch/llm";
import { vi } from "vitest";

import type { WorkerDeps } from "../src/deps.js";
import type { QueueJob } from "../src/queues/schemas.js";

/** In-memory fake DB for handler tests — implements just enough of the drizzle surface. */
export function makeFakeDeps(overrides: Partial<WorkerDeps> = {}): WorkerDeps & {
  enqueued: QueueJob[];
} {
  const enqueued: QueueJob[] = [];
  const deps = {
    db: {} as WorkerDeps["db"],
    storage: {
      put: vi.fn(async () => {}),
      get: vi.fn(async () => "<html></html>"),
    },
    fetcher: {
      fetch: vi.fn(async () => ({ html: "<html></html>", status: 200 })),
      close: vi.fn(async () => {}),
    },
    robots: { isUrlAllowed: vi.fn(async () => true) },
    enqueue: vi.fn(async (job: QueueJob) => {
      enqueued.push(job);
    }),
    classify: vi.fn(
      async (_input: ClassifyInput): Promise<Classification> => ({
        category: "pricing",
        severity: 4,
        headline: "test headline",
        why_it_matters: "test reason",
      }),
    ),
    log: vi.fn(),
    ...overrides,
  };
  return { ...deps, enqueued };
}
