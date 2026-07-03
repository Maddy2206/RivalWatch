import { PlanLimitError } from "@rivalwatch/core";
import { count, eq } from "drizzle-orm";

import type { Db } from "./client.js";
import { competitors, trackedPages, workspaces } from "./schema.js";

export type Plan = "free" | "starter" | "pro";

export interface PlanLimits {
  competitors: number;
  pages: number;
  /** Fastest allowed crawl cadence. */
  minCrawlIntervalMinutes: number;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { competitors: 1, pages: 3, minCrawlIntervalMinutes: 1440 },
  starter: { competitors: 5, pages: 25, minCrawlIntervalMinutes: 360 },
  pro: { competitors: 20, pages: 100, minCrawlIntervalMinutes: 60 },
};

export async function getWorkspacePlan(db: Db, workspaceId: string): Promise<Plan> {
  const [ws] = await db
    .select({ plan: workspaces.plan })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  if (!ws) throw new PlanLimitError(`Workspace not found: ${workspaceId}`);
  return ws.plan;
}

export async function countCompetitors(db: Db, workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(competitors)
    .where(eq(competitors.workspaceId, workspaceId));
  return row?.n ?? 0;
}

export async function countTrackedPages(db: Db, workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(trackedPages)
    .innerJoin(competitors, eq(trackedPages.competitorId, competitors.id))
    .where(eq(competitors.workspaceId, workspaceId));
  return row?.n ?? 0;
}

/** Throws PlanLimitError if the workspace cannot add another competitor. */
export async function assertCanAddCompetitor(db: Db, workspaceId: string): Promise<void> {
  const plan = await getWorkspacePlan(db, workspaceId);
  const used = await countCompetitors(db, workspaceId);
  if (used >= PLAN_LIMITS[plan].competitors) {
    throw new PlanLimitError(
      `Plan "${plan}" allows ${PLAN_LIMITS[plan].competitors} competitors (${used} in use)`,
    );
  }
}

/** Throws PlanLimitError if the workspace cannot track another page. */
export async function assertCanAddPage(db: Db, workspaceId: string): Promise<void> {
  const plan = await getWorkspacePlan(db, workspaceId);
  const used = await countTrackedPages(db, workspaceId);
  if (used >= PLAN_LIMITS[plan].pages) {
    throw new PlanLimitError(
      `Plan "${plan}" allows ${PLAN_LIMITS[plan].pages} tracked pages (${used} in use)`,
    );
  }
}

/** Clamp a requested crawl interval to what the plan allows. */
export function clampCrawlInterval(plan: Plan, requestedMinutes: number): number {
  return Math.max(requestedMinutes, PLAN_LIMITS[plan].minCrawlIntervalMinutes);
}

/**
 * Worker-side check before crawling: the page's workspace must still be within
 * its page budget (covers downgraded/expired workspaces whose pages were
 * created under a bigger plan).
 */
export async function isPageWithinPlan(db: Db, pageId: string): Promise<boolean> {
  const [row] = await db
    .select({ workspaceId: competitors.workspaceId })
    .from(trackedPages)
    .innerJoin(competitors, eq(trackedPages.competitorId, competitors.id))
    .where(eq(trackedPages.id, pageId));
  if (!row) return false;
  const plan = await getWorkspacePlan(db, row.workspaceId);
  const used = await countTrackedPages(db, row.workspaceId);
  return used <= PLAN_LIMITS[plan].pages;
}
