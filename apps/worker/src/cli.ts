/**
 * Manually trigger pipeline stages in dev, without a running worker or Redis:
 * the enqueue dependency is replaced by an inline dispatcher, so a `crawl`
 * trigger runs crawl → extract → diff → classify → alert synchronously.
 *
 *   pnpm worker:trigger crawl --page-id=<uuid>
 *   pnpm worker:trigger diff --snapshot-id=<uuid>
 *   pnpm worker:trigger classify --change-id=<uuid>
 *   pnpm worker:trigger alert --change-id=<uuid>
 */
import { hasLlmProviderConfigured, loadEnv } from "@rivalwatch/config";
import { closeDb, getDb } from "@rivalwatch/db";
import { classifyChange } from "@rivalwatch/llm";

import type { WorkerDeps } from "./deps.js";
import { makeFetcher } from "./fetcher.js";
import { handleAlert } from "./handlers/alert.js";
import { handleClassify } from "./handlers/classify.js";
import { handleCrawl } from "./handlers/crawl.js";
import { handleDiff } from "./handlers/diff.js";
import { handleExtract } from "./handlers/extract.js";
import { RobotsChecker } from "./robots-checker.js";
import type { QueueJob } from "./queues/schemas.js";
import { makeStorage } from "./storage.js";

function argValue(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg?.split("=")[1];
}

async function main(): Promise<void> {
  loadEnv(); // fail fast on invalid env
  const stage = process.argv[2];
  const fetcher = await makeFetcher();

  const deps: WorkerDeps = {
    db: getDb(),
    storage: makeStorage(),
    fetcher,
    robots: new RobotsChecker(),
    enqueue: async () => {},
    classify: classifyChange,
    log: (message) => console.log(message),
  };

  // Inline dispatcher: downstream stages run immediately in-process.
  deps.enqueue = async (job: QueueJob): Promise<void> => {
    switch (job.queue) {
      case "extract":
        return handleExtract(deps, job.payload);
      case "diff":
        return handleDiff(deps, job.payload);
      case "classify":
        if (!hasLlmProviderConfigured()) {
          deps.log(
            `classify: change ${job.payload.changeId} left pending — set ANTHROPIC_API_KEY, GEMINI_API_KEY, or GROQ_API_KEY to classify`,
          );
          return;
        }
        return handleClassify(deps, job.payload);
      case "alert":
        return handleAlert(deps, job.payload);
      case "crawl":
        return handleCrawl(deps, job.payload);
    }
  };

  try {
    switch (stage) {
      case "crawl": {
        const pageId = argValue("page-id");
        if (!pageId) throw new Error("crawl requires --page-id=<uuid>");
        await handleCrawl(deps, { pageId });
        break;
      }
      case "diff": {
        const snapshotId = argValue("snapshot-id");
        if (!snapshotId) throw new Error("diff requires --snapshot-id=<uuid>");
        await handleDiff(deps, { snapshotId });
        break;
      }
      case "classify": {
        const changeId = argValue("change-id");
        if (!changeId) throw new Error("classify requires --change-id=<uuid>");
        await handleClassify(deps, { changeId });
        break;
      }
      case "alert": {
        const changeId = argValue("change-id");
        if (!changeId) throw new Error("alert requires --change-id=<uuid>");
        await handleAlert(deps, { changeId });
        break;
      }
      default:
        console.error("Usage: pnpm worker:trigger <crawl|diff|classify|alert> --<id-flag>=<uuid>");
        process.exitCode = 1;
    }
  } finally {
    await fetcher.close();
    await closeDb();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
