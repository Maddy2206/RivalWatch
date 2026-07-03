import type { ChangeCategory, SectionChange } from "@rivalwatch/core";
import { eq } from "drizzle-orm";

import type { Db } from "../client.js";
import { changes } from "../schema.js";

export type ChangeRow = typeof changes.$inferSelect;

export interface NewChangeContext {
  pageId: string;
  fromSnapshotId: string;
  toSnapshotId: string;
}

export async function insertChanges(
  db: Db,
  ctx: NewChangeContext,
  items: { change: SectionChange; status: "pending" | "noise"; noiseRule?: string }[],
): Promise<ChangeRow[]> {
  if (items.length === 0) return [];
  return db
    .insert(changes)
    .values(
      items.map(({ change, status, noiseRule }) => ({
        pageId: ctx.pageId,
        fromSnapshotId: ctx.fromSnapshotId,
        toSnapshotId: ctx.toSnapshotId,
        anchorKey: change.anchorKey,
        changeType: change.changeType,
        sectionKind: change.sectionKind,
        heading: change.heading,
        beforeText: change.before,
        afterText: change.after,
        diffSummary: change.diffSummary,
        status,
        noiseRule: noiseRule ?? null,
      })),
    )
    .returning();
}

export async function getChangeById(db: Db, changeId: string): Promise<ChangeRow | undefined> {
  const [row] = await db.select().from(changes).where(eq(changes.id, changeId));
  return row;
}

export async function getPendingChanges(db: Db, limit = 100): Promise<ChangeRow[]> {
  return db.select().from(changes).where(eq(changes.status, "pending")).limit(limit);
}

export async function setChangeClassification(
  db: Db,
  changeId: string,
  classification: {
    category: ChangeCategory;
    severity: number;
    headline: string;
    whyItMatters: string;
  },
): Promise<void> {
  await db
    .update(changes)
    .set({ ...classification, status: "classified", updatedAt: new Date() })
    .where(eq(changes.id, changeId));
}

export async function setChangeError(db: Db, changeId: string): Promise<void> {
  await db
    .update(changes)
    .set({ status: "error", updatedAt: new Date() })
    .where(eq(changes.id, changeId));
}
