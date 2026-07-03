import { eq } from "drizzle-orm";

import type { Db } from "../client.js";
import { assertCanAddCompetitor, assertCanAddPage, clampCrawlInterval, getWorkspacePlan } from "../limits.js";
import { competitors, trackedPages, workspaces } from "../schema.js";

export type Workspace = typeof workspaces.$inferSelect;
export type Competitor = typeof competitors.$inferSelect;

export async function createWorkspace(db: Db, name: string): Promise<Workspace> {
  const [row] = await db.insert(workspaces).values({ name }).returning();
  if (!row) throw new Error("workspace insert returned no row");
  return row;
}

export async function getWorkspaceById(db: Db, id: string): Promise<Workspace | undefined> {
  const [row] = await db.select().from(workspaces).where(eq(workspaces.id, id));
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
