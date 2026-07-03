import { hasResendConfigured, loadEnv } from "@rivalwatch/config";
import {
  getBriefById,
  getChangesForWorkspaceInPeriod,
  getWorkspaceById,
  getWorkspaceOwnerEmail,
  markBriefSent,
} from "@rivalwatch/db";

import type { WorkerDeps } from "../deps.js";
import type { DeliverPayload } from "../queues/schemas.js";

export async function handleDeliver(deps: WorkerDeps, payload: DeliverPayload): Promise<void> {
  const brief = await getBriefById(deps.db, payload.briefId);
  if (!brief) {
    deps.log(`deliver: brief ${payload.briefId} not found — skipping`);
    return;
  }

  const workspace = await getWorkspaceById(deps.db, brief.workspaceId);
  if (!workspace) {
    deps.log(`deliver: workspace ${brief.workspaceId} missing for brief ${brief.id} — skipping`);
    return;
  }

  const ownerEmail = await getWorkspaceOwnerEmail(deps.db, workspace.id);
  if (!ownerEmail) {
    deps.log(`deliver: workspace ${workspace.id} has no owner — brief ${brief.id} left unsent`);
    return;
  }

  if (!hasResendConfigured()) {
    deps.log(`deliver: brief ${brief.id} ready but RESEND_API_KEY not set — left unsent`);
    return;
  }

  const changes = await getChangesForWorkspaceInPeriod(
    deps.db,
    workspace.id,
    brief.periodStart,
    brief.periodEnd,
  );

  await deps.sendBriefEmail(ownerEmail, {
    workspaceName: workspace.name,
    periodStart: brief.periodStart.toISOString().slice(0, 10),
    periodEnd: brief.periodEnd.toISOString().slice(0, 10),
    summaryMd: brief.contentMd,
    changes: changes.map((c) => ({
      competitorName: c.competitorName,
      headline: c.headline ?? "(untitled)",
      category: c.category ?? "other",
      severity: c.severity ?? 1,
      whyItMatters: c.whyItMatters ?? "",
    })),
    dashboardUrl: `${loadEnv().APP_URL}/changes`,
  });

  await markBriefSent(deps.db, brief.id);
  deps.log(`deliver: sent brief ${brief.id} to ${ownerEmail}`);
}
