import { loadEnv } from "@rivalwatch/config";
import {
  closeDb,
  getDb,
  getPagesDueForCrawl,
  getWorkspacesDueForBrief,
  isPageWithinPlan,
  leasePageForCrawl,
} from "@rivalwatch/db";
import { classifyChange, synthesizeBrief } from "@rivalwatch/llm";

import type { WorkerDeps } from "./deps.js";
import { sendAlertEmail, sendBriefEmail } from "./email.js";
import { makeFetcher } from "./fetcher.js";
import { makeEnqueue, makeQueues, makeRedisConnection, startWorkers } from "./queues/index.js";
import { RobotsChecker } from "./robots-checker.js";
import { makeStorage } from "./storage.js";

const SCHEDULER_INTERVAL_MS = 60_000;
const BRIEF_SCHEDULER_INTERVAL_MS = 60 * 60_000;
const MAX_JITTER_MS = 30_000;

async function main(): Promise<void> {
  loadEnv(); // fail fast on invalid env

  const connection = makeRedisConnection();
  const queues = makeQueues(connection);
  const enqueue = makeEnqueue(queues);
  const fetcher = await makeFetcher();

  const deps: WorkerDeps = {
    db: getDb(),
    storage: makeStorage(),
    fetcher,
    robots: new RobotsChecker(),
    enqueue,
    classify: classifyChange,
    synthesizeBrief,
    sendAlertEmail,
    sendBriefEmail,
    log: (message) => console.log(`[${new Date().toISOString()}] ${message}`),
  };

  const workers = startWorkers(makeRedisConnection(), deps);
  deps.log(`worker: ${workers.length} queue consumers started`);

  // Cron scheduler: enqueue due pages with jitter so crawls don't align into
  // bursts against the same domains.
  const schedule = async (): Promise<void> => {
    const due = await getPagesDueForCrawl(deps.db);
    for (const page of due) {
      if (!(await isPageWithinPlan(deps.db, page.id))) continue;
      await leasePageForCrawl(deps.db, page.id);
      await enqueue(
        { queue: "crawl", payload: { pageId: page.id } },
        { delayMs: Math.floor(Math.random() * MAX_JITTER_MS) },
      );
    }
    if (due.length > 0) deps.log(`scheduler: enqueued ${due.length} due page(s)`);
  };

  // Weekly-brief scheduler: hourly tick, one brief per workspace at most
  // every 7 days (see getWorkspacesDueForBrief).
  const scheduleBriefs = async (): Promise<void> => {
    const due = await getWorkspacesDueForBrief(deps.db);
    for (const workspace of due) {
      await enqueue({ queue: "brief", payload: { workspaceId: workspace.id } });
    }
    if (due.length > 0) deps.log(`brief-scheduler: enqueued ${due.length} workspace(s)`);
  };

  await schedule();
  await scheduleBriefs();
  const timer = setInterval(() => void schedule().catch((e) => deps.log(`scheduler error: ${e}`)), SCHEDULER_INTERVAL_MS);
  const briefTimer = setInterval(
    () => void scheduleBriefs().catch((e) => deps.log(`brief-scheduler error: ${e}`)),
    BRIEF_SCHEDULER_INTERVAL_MS,
  );

  const shutdown = async (): Promise<void> => {
    deps.log("worker: shutting down…");
    clearInterval(timer);
    clearInterval(briefTimer);
    await Promise.all(workers.map((w) => w.close()));
    await Promise.all(Object.values(queues).map((q) => q.close()));
    await fetcher.close();
    await closeDb();
    connection.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((error) => {
  console.error("worker failed to start:", error);
  process.exit(1);
});
