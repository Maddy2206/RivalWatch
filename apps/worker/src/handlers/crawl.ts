import { RobotsDisallowedError } from "@rivalwatch/core";
import {
  getPageById,
  isPageWithinPlan,
  pausePage,
  recordPageFailure,
  schedulePageAfterSuccess,
} from "@rivalwatch/db";

import type { WorkerDeps } from "../deps.js";
import type { CrawlPayload } from "../queues/schemas.js";

/**
 * Crawl one tracked page: politeness checks (plan limits, robots.txt),
 * fetch, archive raw HTML, hand off to extract. Failures back off and mark
 * the page degraded after 3 consecutive misses.
 */
export async function handleCrawl(deps: WorkerDeps, payload: CrawlPayload): Promise<void> {
  const page = await getPageById(deps.db, payload.pageId);
  if (!page) {
    deps.log(`crawl: page ${payload.pageId} not found — skipping`);
    return;
  }
  if (page.status === "paused") {
    deps.log(`crawl: page ${page.id} is paused — skipping`);
    return;
  }

  // Invariant 6: the worker re-checks plan limits before crawling so
  // downgraded/expired workspaces stop consuming crawls.
  if (!(await isPageWithinPlan(deps.db, page.id))) {
    deps.log(`crawl: page ${page.id} outside workspace plan — skipping`);
    return;
  }

  if (!(await deps.robots.isUrlAllowed(page.url))) {
    await pausePage(deps.db, page.id);
    throw new RobotsDisallowedError(page.url);
  }

  let result;
  try {
    result = await deps.fetcher.fetch(page.url);
  } catch (error) {
    const { degraded } = await recordPageFailure(deps.db, page.id);
    if (degraded) deps.log(`crawl: page ${page.id} marked degraded after repeated failures`);
    throw error;
  }

  const rawHtmlKey = `raw/${page.id}/${Date.now()}.html`;
  await deps.storage.put(rawHtmlKey, result.html);

  const jitterMinutes = Math.floor(Math.random() * 15);
  await schedulePageAfterSuccess(deps.db, page.id, jitterMinutes);

  await deps.enqueue({
    queue: "extract",
    payload: { pageId: page.id, rawHtmlKey, httpStatus: result.status },
  });
  deps.log(`crawl: page ${page.id} fetched (${result.status}), raw html at ${rawHtmlKey}`);
}
