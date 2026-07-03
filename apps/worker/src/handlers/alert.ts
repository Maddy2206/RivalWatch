import { createAlert, getChangeById, getPageContext } from "@rivalwatch/db";

import type { WorkerDeps } from "../deps.js";
import type { AlertPayload } from "../queues/schemas.js";

/**
 * Instant alert for a high-severity pricing/packaging change. Phase 1 records
 * the alert; Phase 3 adds Resend email delivery via packages/emails.
 */
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
  deps.log(
    `alert: recorded ${alert.id} for workspace ${context.workspaceId} — "${change.headline}" (email delivery ships in Phase 3)`,
  );
}
