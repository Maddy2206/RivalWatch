import { createBrief, getChangesForWorkspaceInPeriod, getWorkspaceById } from "@rivalwatch/db";

import type { WorkerDeps } from "../deps.js";
import type { BriefPayload } from "../queues/schemas.js";

const BRIEF_INTERVAL_DAYS = 7;

/**
 * Synthesizes a workspace's classified changes over the last 7 days into a
 * weekly-brief narrative, stores it, and hands off to deliver. Skips
 * silently if there's nothing to report — no brief row, no empty email.
 */
export async function handleBrief(deps: WorkerDeps, payload: BriefPayload): Promise<void> {
  const workspace = await getWorkspaceById(deps.db, payload.workspaceId);
  if (!workspace) {
    deps.log(`brief: workspace ${payload.workspaceId} not found — skipping`);
    return;
  }

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - BRIEF_INTERVAL_DAYS * 24 * 60 * 60 * 1000);

  const changes = await getChangesForWorkspaceInPeriod(deps.db, workspace.id, periodStart, periodEnd);
  if (changes.length === 0) {
    deps.log(`brief: workspace ${workspace.id} has no classified changes this period — skipping`);
    return;
  }

  const synthesis = await deps.synthesizeBrief({
    workspaceName: workspace.name,
    periodStart: periodStart.toISOString().slice(0, 10),
    periodEnd: periodEnd.toISOString().slice(0, 10),
    changes,
  });

  const brief = await createBrief(deps.db, {
    workspaceId: workspace.id,
    periodStart,
    periodEnd,
    contentMd: synthesis.contentMd,
  });

  await deps.enqueue({ queue: "deliver", payload: { briefId: brief.id } });
  deps.log(`brief: created ${brief.id} for workspace ${workspace.id} (${changes.length} changes)`);
}
