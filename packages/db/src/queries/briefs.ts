import { and, desc, eq, gte, isNull, lte, or } from "drizzle-orm";

import type { Db } from "../client.js";
import { briefs, changes, competitors, trackedPages, user, workspaces } from "../schema.js";

export type BriefRow = typeof briefs.$inferSelect;

const BRIEF_INTERVAL_DAYS = 7;

export async function createBrief(
  db: Db,
  input: { workspaceId: string; periodStart: Date; periodEnd: Date; contentMd: string },
): Promise<BriefRow> {
  const [row] = await db.insert(briefs).values(input).returning();
  if (!row) throw new Error("brief insert returned no row");
  return row;
}

export async function getBriefById(db: Db, briefId: string): Promise<BriefRow | undefined> {
  const [row] = await db.select().from(briefs).where(eq(briefs.id, briefId));
  return row;
}

export async function markBriefSent(db: Db, briefId: string): Promise<void> {
  await db.update(briefs).set({ sentAt: new Date() }).where(eq(briefs.id, briefId));
}

/**
 * Workspaces due for a new weekly brief: at least one competitor tracked,
 * and either no brief yet or the latest brief's period ended a week ago or more.
 */
export async function getWorkspacesDueForBrief(db: Db): Promise<{ id: string; name: string }[]> {
  const cutoff = new Date(Date.now() - BRIEF_INTERVAL_DAYS * 24 * 60 * 60 * 1000);

  const latestBriefPerWorkspace = db
    .selectDistinctOn([briefs.workspaceId], {
      workspaceId: briefs.workspaceId,
      periodEnd: briefs.periodEnd,
    })
    .from(briefs)
    .orderBy(briefs.workspaceId, desc(briefs.periodEnd))
    .as("latest_brief");

  return db
    .selectDistinct({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .innerJoin(competitors, eq(competitors.workspaceId, workspaces.id))
    .leftJoin(latestBriefPerWorkspace, eq(latestBriefPerWorkspace.workspaceId, workspaces.id))
    .where(
      or(isNull(latestBriefPerWorkspace.periodEnd), lte(latestBriefPerWorkspace.periodEnd, cutoff)),
    );
}

export interface BriefChangeRow {
  headline: string | null;
  category: string | null;
  severity: number | null;
  whyItMatters: string | null;
  competitorName: string;
}

/** Classified changes for a workspace within a period — the raw material for brief synthesis. */
export async function getChangesForWorkspaceInPeriod(
  db: Db,
  workspaceId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<BriefChangeRow[]> {
  return db
    .select({
      headline: changes.headline,
      category: changes.category,
      severity: changes.severity,
      whyItMatters: changes.whyItMatters,
      competitorName: competitors.name,
    })
    .from(changes)
    .innerJoin(trackedPages, eq(changes.pageId, trackedPages.id))
    .innerJoin(competitors, eq(trackedPages.competitorId, competitors.id))
    .where(
      and(
        eq(competitors.workspaceId, workspaceId),
        eq(changes.status, "classified"),
        gte(changes.createdAt, periodStart),
        lte(changes.createdAt, periodEnd),
      ),
    )
    .orderBy(desc(changes.severity));
}

/** The workspace owner's email, for alert/brief delivery. Undefined for ownerless (dev/seed) workspaces. */
export async function getWorkspaceOwnerEmail(db: Db, workspaceId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ email: user.email })
    .from(workspaces)
    .innerJoin(user, eq(workspaces.ownerId, user.id))
    .where(eq(workspaces.id, workspaceId));
  return row?.email;
}
