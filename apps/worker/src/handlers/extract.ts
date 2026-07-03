import { extractSections, sha256Hex } from "@rivalwatch/core";
import { insertSnapshotWithSections } from "@rivalwatch/db";

import type { WorkerDeps } from "../deps.js";
import type { ExtractPayload } from "../queues/schemas.js";

/** Cheap whole-page fingerprint: hash of the ordered section hashes. */
export function contentHashOf(sectionHashes: string[]): string {
  return sha256Hex(sectionHashes.join("\n"));
}

/**
 * Turn archived raw HTML into a snapshot + sections (the diffable units),
 * stamped with the extract version, then hand off to diff.
 */
export async function handleExtract(deps: WorkerDeps, payload: ExtractPayload): Promise<void> {
  const html = await deps.storage.get(payload.rawHtmlKey);
  const result = extractSections(html);

  const snapshot = await insertSnapshotWithSections(
    deps.db,
    {
      pageId: payload.pageId,
      httpStatus: payload.httpStatus,
      rawHtmlKey: payload.rawHtmlKey,
      extractVersion: result.extractVersion,
      contentHash: contentHashOf(result.sections.map((s) => s.textHash)),
    },
    result.sections,
  );

  await deps.enqueue({ queue: "diff", payload: { snapshotId: snapshot.id } });
  deps.log(
    `extract: snapshot ${snapshot.id} for page ${payload.pageId} (${result.sections.length} sections, v${result.extractVersion})`,
  );
}
