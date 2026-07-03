import { diffSnapshots, extractSections, gateChanges } from "@rivalwatch/core";
import {
  getPreviousSnapshot,
  getSectionsForSnapshot,
  getSnapshotById,
  insertChanges,
  replaceSnapshotSections,
} from "@rivalwatch/db";

import type { WorkerDeps } from "../deps.js";
import { contentHashOf } from "./extract.js";
import type { DiffPayload } from "../queues/schemas.js";

/**
 * Diff a fresh snapshot against the previous one for its page. If extraction
 * logic has moved on since the previous snapshot, its archived raw HTML is
 * re-extracted first — snapshots with different extract versions are never
 * diffed (invariant 3). The noise gate runs before anything reaches the LLM
 * (invariant 4).
 */
export async function handleDiff(deps: WorkerDeps, payload: DiffPayload): Promise<void> {
  const snapshot = await getSnapshotById(deps.db, payload.snapshotId);
  if (!snapshot) {
    deps.log(`diff: snapshot ${payload.snapshotId} not found — skipping`);
    return;
  }

  let previous = await getPreviousSnapshot(deps.db, snapshot.pageId, snapshot);
  if (!previous) {
    deps.log(`diff: snapshot ${snapshot.id} is the first for page ${snapshot.pageId} — baseline stored`);
    return;
  }

  if (previous.extractVersion !== snapshot.extractVersion) {
    deps.log(
      `diff: re-extracting snapshot ${previous.id} (v${previous.extractVersion} → v${snapshot.extractVersion}) from raw HTML`,
    );
    const html = await deps.storage.get(previous.rawHtmlKey);
    const reExtracted = extractSections(html);
    await replaceSnapshotSections(
      deps.db,
      previous.id,
      reExtracted.extractVersion,
      contentHashOf(reExtracted.sections.map((s) => s.textHash)),
      reExtracted.sections,
    );
    previous = { ...previous, extractVersion: reExtracted.extractVersion };
  }

  if (previous.contentHash === snapshot.contentHash) {
    deps.log(`diff: snapshot ${snapshot.id} identical to previous — nothing to do`);
    return;
  }

  const [beforeSections, afterSections] = await Promise.all([
    getSectionsForSnapshot(deps.db, previous.id),
    getSectionsForSnapshot(deps.db, snapshot.id),
  ]);

  const changes = diffSnapshots(
    { extractVersion: previous.extractVersion, sections: beforeSections },
    { extractVersion: snapshot.extractVersion, sections: afterSections },
  );
  if (changes.length === 0) {
    deps.log(`diff: snapshot ${snapshot.id} produced no section changes`);
    return;
  }

  const { signal, noise } = gateChanges(changes);
  const rows = await insertChanges(
    deps.db,
    { pageId: snapshot.pageId, fromSnapshotId: previous.id, toSnapshotId: snapshot.id },
    [
      ...signal.map((change) => ({ change, status: "pending" as const })),
      ...noise.map(({ change, rule }) => ({ change, status: "noise" as const, noiseRule: rule })),
    ],
  );

  const pending = rows.filter((row) => row.status === "pending");
  for (const change of pending) {
    await deps.enqueue({ queue: "classify", payload: { changeId: change.id } });
  }
  deps.log(
    `diff: snapshot ${snapshot.id} → ${signal.length} signal, ${noise.length} noise (${noise
      .map((n) => n.rule)
      .join(", ")})`,
  );
}
