import { and, asc, eq, lte, sql } from "drizzle-orm";

import type { Db } from "../client.js";
import { competitors, trackedPages } from "../schema.js";

export const DEGRADED_AFTER_FAILURES = 3;

export type TrackedPage = typeof trackedPages.$inferSelect;

export async function getPageById(db: Db, pageId: string): Promise<TrackedPage | undefined> {
  const [page] = await db.select().from(trackedPages).where(eq(trackedPages.id, pageId));
  return page;
}

export async function getPageDomain(db: Db, pageId: string): Promise<string | undefined> {
  const page = await getPageById(db, pageId);
  if (!page) return undefined;
  try {
    return new URL(page.url).hostname;
  } catch {
    return undefined;
  }
}

export async function getWorkspaceIdForPage(db: Db, pageId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ workspaceId: competitors.workspaceId })
    .from(trackedPages)
    .innerJoin(competitors, eq(trackedPages.competitorId, competitors.id))
    .where(eq(trackedPages.id, pageId));
  return row?.workspaceId;
}

export interface PageContext {
  pageId: string;
  url: string;
  kind: TrackedPage["kind"];
  competitorName: string;
  workspaceId: string;
}

/** Page + competitor + workspace context, e.g. for LLM classification prompts. */
export async function getPageContext(db: Db, pageId: string): Promise<PageContext | undefined> {
  const [row] = await db
    .select({
      pageId: trackedPages.id,
      url: trackedPages.url,
      kind: trackedPages.kind,
      competitorName: competitors.name,
      workspaceId: competitors.workspaceId,
    })
    .from(trackedPages)
    .innerJoin(competitors, eq(trackedPages.competitorId, competitors.id))
    .where(eq(trackedPages.id, pageId));
  return row;
}

/**
 * Short lease taken when a crawl job is enqueued so the scheduler doesn't
 * re-enqueue the same page every tick; the crawl outcome sets the real next time.
 */
export async function leasePageForCrawl(db: Db, pageId: string, leaseMinutes = 10): Promise<void> {
  await db
    .update(trackedPages)
    .set({ nextCrawlAt: new Date(Date.now() + leaseMinutes * 60_000) })
    .where(eq(trackedPages.id, pageId));
}

/** Active pages whose next_crawl_at has passed, oldest first. */
export async function getPagesDueForCrawl(db: Db, limit = 50): Promise<TrackedPage[]> {
  return db
    .select()
    .from(trackedPages)
    .where(and(eq(trackedPages.status, "active"), lte(trackedPages.nextCrawlAt, new Date())))
    .orderBy(asc(trackedPages.nextCrawlAt))
    .limit(limit);
}

/** Successful crawl: reset failures, schedule the next crawl (with caller-provided jitter). */
export async function schedulePageAfterSuccess(
  db: Db,
  pageId: string,
  jitterMinutes = 0,
): Promise<void> {
  const now = new Date();
  const page = await getPageById(db, pageId);
  if (!page) return;
  const next = new Date(
    now.getTime() + (page.crawlIntervalMinutes + jitterMinutes) * 60_000,
  );
  await db
    .update(trackedPages)
    .set({
      failureCount: 0,
      status: page.status === "degraded" ? "active" : page.status,
      lastCrawledAt: now,
      nextCrawlAt: next,
      updatedAt: now,
    })
    .where(eq(trackedPages.id, pageId));
}

/**
 * Failed crawl: bump failure count with exponential backoff on the next
 * attempt; mark the page degraded after DEGRADED_AFTER_FAILURES consecutive
 * failures (shown honestly in the UI, never silently stale).
 */
export async function recordPageFailure(db: Db, pageId: string): Promise<{ degraded: boolean }> {
  const page = await getPageById(db, pageId);
  if (!page) return { degraded: false };
  const failures = page.failureCount + 1;
  const degraded = failures >= DEGRADED_AFTER_FAILURES;
  const backoffMinutes = Math.min(page.crawlIntervalMinutes, 30 * 2 ** failures);
  await db
    .update(trackedPages)
    .set({
      failureCount: failures,
      status: degraded ? "degraded" : page.status,
      nextCrawlAt: new Date(Date.now() + backoffMinutes * 60_000),
      updatedAt: new Date(),
    })
    .where(eq(trackedPages.id, pageId));
  return { degraded };
}

/** Stop crawling a page (robots.txt disallow, user request). */
export async function pausePage(db: Db, pageId: string): Promise<void> {
  await db
    .update(trackedPages)
    .set({ status: "paused", updatedAt: new Date() })
    .where(eq(trackedPages.id, pageId));
}

/** Re-activate a degraded page (manual retry from the UI or CLI). */
export async function reactivatePage(db: Db, pageId: string): Promise<void> {
  await db
    .update(trackedPages)
    .set({ status: "active", failureCount: 0, nextCrawlAt: sql`now()`, updatedAt: new Date() })
    .where(eq(trackedPages.id, pageId));
}
