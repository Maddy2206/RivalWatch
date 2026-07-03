import { hasResendConfigured, loadEnv } from "@rivalwatch/config";
import { createAlert, getChangeById, getPageContext, getWorkspaceOwnerEmail, markAlertSent } from "@rivalwatch/db";

import type { WorkerDeps } from "../deps.js";
import type { AlertPayload } from "../queues/schemas.js";

/** Instant alert for a high-severity pricing/packaging change: records it, then emails the owner. */
export async function handleAlert(deps: WorkerDeps, payload: AlertPayload): Promise<void> {
  const change = await getChangeById(deps.db, payload.changeId);
  if (!change || change.status !== "classified") {
    deps.log(`alert: change ${payload.changeId} missing or unclassified — skipping`);
    return;
  }
  const context = await getPageContext(deps.db, change.pageId);
  if (!context) {
    deps.log(`alert: page context missing for change ${change.id} — skipping`);
    return;
  }

  const alert = await createAlert(deps.db, {
    workspaceId: context.workspaceId,
    changeId: change.id,
  });

  const ownerEmail = await getWorkspaceOwnerEmail(deps.db, context.workspaceId);
  if (!ownerEmail) {
    deps.log(`alert: recorded ${alert.id}, workspace ${context.workspaceId} has no owner — left unsent`);
    return;
  }
  if (!hasResendConfigured()) {
    deps.log(`alert: recorded ${alert.id} — RESEND_API_KEY not set, left unsent`);
    return;
  }

  await deps.sendAlertEmail(ownerEmail, {
    competitorName: context.competitorName,
    headline: change.headline ?? "(untitled)",
    category: change.category ?? "other",
    severity: change.severity ?? 4,
    whyItMatters: change.whyItMatters ?? "",
    changeUrl: `${loadEnv().APP_URL}/changes`,
  });
  await markAlertSent(deps.db, alert.id);
  deps.log(`alert: sent ${alert.id} to ${ownerEmail} — "${change.headline}"`);
}
