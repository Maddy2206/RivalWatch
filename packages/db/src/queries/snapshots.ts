import type { Section } from "@rivalwatch/core";
import { and, desc, eq, lt } from "drizzle-orm";

import type { Db } from "../client.js";
import { sections, snapshots } from "../schema.js";

export type Snapshot = typeof snapshots.$inferSelect;
export type SectionRow = typeof sections.$inferSelect;

export interface NewSnapshot {
  pageId: string;
  httpStatus: number | null;
  rawHtmlKey: string;
  extractVersion: number;
  contentHash: string;
}

export async function insertSnapshotWithSections(
  db: Db,
  snapshot: NewSnapshot,
  extracted: Section[],
): Promise<Snapshot> {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(snapshots).values(snapshot).returning();
    if (!row) throw new Error("snapshot insert returned no row");
    if (extracted.length > 0) {
      await tx.insert(sections).values(
        extracted.map((s) => ({
          snapshotId: row.id,
          anchorKey: s.anchorKey,
          kind: s.kind,
          heading: s.heading,
          position: s.position,
          normalizedText: s.normalizedText,
          textHash: s.textHash,
        })),
      );
    }
    return row;
  });
}

export async function getSnapshotById(db: Db, snapshotId: string): Promise<Snapshot | undefined> {
  const [row] = await db.select().from(snapshots).where(eq(snapshots.id, snapshotId));
  return row;
}

export async function getLatestSnapshot(db: Db, pageId: string): Promise<Snapshot | undefined> {
  const [row] = await db
    .select()
    .from(snapshots)
    .where(eq(snapshots.pageId, pageId))
    .orderBy(desc(snapshots.fetchedAt))
    .limit(1);
  return row;
}

/** The most recent snapshot for the page taken before the given one. */
export async function getPreviousSnapshot(
  db: Db,
  pageId: string,
  before: Snapshot,
): Promise<Snapshot | undefined> {
  const [row] = await db
    .select()
    .from(snapshots)
    .where(and(eq(snapshots.pageId, pageId), lt(snapshots.fetchedAt, before.fetchedAt)))
    .orderBy(desc(snapshots.fetchedAt))
    .limit(1);
  return row;
}

export async function getSectionsForSnapshot(db: Db, snapshotId: string): Promise<Section[]> {
  const rows = await db
    .select()
    .from(sections)
    .where(eq(sections.snapshotId, snapshotId))
    .orderBy(sections.position);
  return rows.map((r) => ({
    anchorKey: r.anchorKey,
    kind: r.kind,
    heading: r.heading,
    position: r.position,
    normalizedText: r.normalizedText,
    textHash: r.textHash,
  }));
}

/**
 * Replace a snapshot's sections after re-extracting its archived raw HTML
 * with a newer extractor (the extract_version migration path).
 */
export async function replaceSnapshotSections(
  db: Db,
  snapshotId: string,
  extractVersion: number,
  contentHash: string,
  extracted: Section[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(sections).where(eq(sections.snapshotId, snapshotId));
    if (extracted.length > 0) {
      await tx.insert(sections).values(
        extracted.map((s) => ({
          snapshotId,
          anchorKey: s.anchorKey,
          kind: s.kind,
          heading: s.heading,
          position: s.position,
          normalizedText: s.normalizedText,
          textHash: s.textHash,
        })),
      );
    }
    await tx
      .update(snapshots)
      .set({ extractVersion, contentHash })
      .where(eq(snapshots.id, snapshotId));
  });
}
