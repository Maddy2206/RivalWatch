import type { Db } from "@rivalwatch/db";
import type { InstantAlertEmailProps, WeeklyBriefEmailProps } from "@rivalwatch/emails";
import type { BriefInput, BriefSynthesis, Classification, ClassifyInput } from "@rivalwatch/llm";

import type { PageFetcher } from "./fetcher.js";
import type { QueueJob } from "./queues/schemas.js";
import type { Storage } from "./storage.js";

/**
 * Everything a queue handler touches, injected as one object so unit tests
 * can pass mocks without Redis, Playwright, Postgres wrappers, the LLM, or
 * Resend.
 */
export interface WorkerDeps {
  db: Db;
  storage: Storage;
  fetcher: PageFetcher;
  robots: { isUrlAllowed(url: string): Promise<boolean> };
  enqueue: (job: QueueJob) => Promise<void>;
  classify: (input: ClassifyInput) => Promise<Classification>;
  synthesizeBrief: (input: BriefInput) => Promise<BriefSynthesis>;
  sendAlertEmail: (to: string, props: InstantAlertEmailProps) => Promise<void>;
  sendBriefEmail: (to: string, props: WeeklyBriefEmailProps) => Promise<void>;
  log: (message: string) => void;
}
