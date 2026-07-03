import type { Db } from "@rivalwatch/db";
import type { Classification, ClassifyInput } from "@rivalwatch/llm";

import type { PageFetcher } from "./fetcher.js";
import type { QueueJob } from "./queues/schemas.js";
import type { Storage } from "./storage.js";

/**
 * Everything a queue handler touches, injected as one object so unit tests
 * can pass mocks without Redis, Playwright, Postgres wrappers, or the LLM.
 */
export interface WorkerDeps {
  db: Db;
  storage: Storage;
  fetcher: PageFetcher;
  robots: { isUrlAllowed(url: string): Promise<boolean> };
  enqueue: (job: QueueJob) => Promise<void>;
  classify: (input: ClassifyInput) => Promise<Classification>;
  log: (message: string) => void;
}
