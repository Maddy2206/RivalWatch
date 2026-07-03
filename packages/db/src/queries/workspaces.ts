import { eq } from "drizzle-orm";

import type { Db } from "../client.js";
import {
  assertCanAddCompetitor,
  assertCanAddPage,
  clampCrawlInterval,
  getWorkspacePlan,
  type Plan,
} from "../limits.js";
import { competitors, trackedPages, workspaces } from "../schema.js";

export type Workspace = typeof workspaces.$inferSelect;
export type Competitor = typeof competitors.$inferSelect;

export async function createWorkspace(db: Db, name: string, ownerId?: string): Promise<Workspace> {
  const [row] = await db.insert(workspaces).values({ name, ownerId }).returning();
  if (!row) throw new Error("workspace insert returned no row");
  return row;
}

export async function getWorkspaceById(db: Db, id: string): Promise<Workspace | undefined> {
  const [row] = await db.select().from(workspaces).where(eq(workspaces.id, id));
  return row;
}

/** Applied by the Lemon Squeezy webhook handler when a subscription is created/updated/cancelled. */
export async function setWorkspaceSubscription(
  db: Db,
  workspaceId: string,
  input: {
    plan: Plan;
    lemonSqueezyCustomerId: string | null;
    lemonSqueezySubscriptionId: string | null;
    subscriptionStatus: string | null;
  },
): Promise<void> {
  await db
    .update(workspaces)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));
}

export async function getWorkspaceForOwner(db: Db, ownerId: string): Promise<Workspace | undefined> {
  const [row] = await db.select().from(workspaces).where(eq(workspaces.ownerId, ownerId));
  return row;
}

/**
 * Dashboard auto-provisioning: every signed-in user gets exactly one
 * workspace. Atomic (INSERT ... ON CONFLICT) rather than check-then-insert —
 * layout.tsx and page.tsx both call requireSession() in the same render, so
 * a plain "select, then insert if missing" races and can create duplicates.
 * Relies on the unique constraint on workspaces.owner_id.
 */
export async function getOrCreateWorkspaceForOwner(
  db: Db,
  ownerId: string,
  defaultName: string,
): Promise<Workspace> {
  const [inserted] = await db
    .insert(workspaces)
    .values({ name: defaultName, ownerId })
    .onConflictDoNothing({ target: workspaces.ownerId })
    .returning();
  if (inserted) return inserted;

  const existing = await getWorkspaceForOwner(db, ownerId);
  if (!existing) throw new Error(`Failed to get or create workspace for owner ${ownerId}`);
  return existing;
}

export async function getCompetitorsForWorkspace(db: Db, workspaceId: string): Promise<Competitor[]> {
  return db.select().from(competitors).where(eq(competitors.workspaceId, workspaceId));
}

export async function getCompetitorById(db: Db, competitorId: string): Promise<Competitor | undefined> {
  const [row] = await db.select().from(competitors).where(eq(competitors.id, competitorId));
  return row;
}

/** Plan limits are enforced here, in the DB layer — not just in the UI. */
export async function addCompetitor(
  db: Db,
  workspaceId: string,
  input: { name: string; domain: string },
): Promise<Competitor> {
  await assertCanAddCompetitor(db, workspaceId);
  const [row] = await db
    .insert(competitors)
    .values({ workspaceId, ...input })
    .returning();
  if (!row) throw new Error("competitor insert returned no row");
  return row;
}

/**
 * Deletes a competitor and everything under it (tracked pages, snapshots,
 * sections, changes — all cascade via FK). Caller must verify workspace
 * ownership first (see invariant 10 in CLAUDE.md); this only guards against
 * deleting a competitor that doesn't exist.
 */
export async function deleteCompetitor(db: Db, competitorId: string): Promise<void> {
  const result = await db.delete(competitors).where(eq(competitors.id, competitorId)).returning();
  if (result.length === 0) throw new Error(`Competitor ${competitorId} not found`);
}

export async function addTrackedPage(
  db: Db,
  workspaceId: string,
  competitorId: string,
  input: {
    url: string;
    kind?: typeof trackedPages.$inferInsert.kind;
    crawlIntervalMinutes?: number;
  },
): Promise<typeof trackedPages.$inferSelect> {
  const competitor = await getCompetitorById(db, competitorId);
  if (!competitor || competitor.workspaceId !== workspaceId) {
    throw new Error(`Competitor ${competitorId} does not belong to workspace ${workspaceId}`);
  }
  await assertCanAddPage(db, workspaceId);
  const plan = await getWorkspacePlan(db, workspaceId);
  const interval = clampCrawlInterval(plan, input.crawlIntervalMinutes ?? 1440);
  const [row] = await db
    .insert(trackedPages)
    .values({
      competitorId,
      url: input.url,
      kind: input.kind ?? "custom",
      crawlIntervalMinutes: interval,
    })
    .returning();
  if (!row) throw new Error("tracked page insert returned no row");
  return row;
}
