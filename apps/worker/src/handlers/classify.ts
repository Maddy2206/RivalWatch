import { LlmParseError } from "@rivalwatch/core";
import { getChangeById, getPageContext, setChangeClassification, setChangeError } from "@rivalwatch/db";

import type { WorkerDeps } from "../deps.js";
import type { ClassifyPayload } from "../queues/schemas.js";

/** Categories whose severity-≥4 changes trigger an instant alert. */
const ALERT_CATEGORIES = new Set(["pricing", "packaging"]);
const ALERT_MIN_SEVERITY = 4;

/**
 * Ask the LLM gateway to classify a pending change (category, severity,
 * headline, why-it-matters). High-severity pricing/packaging changes are
 * escalated to the alert queue.
 */
export async function handleClassify(deps: WorkerDeps, payload: ClassifyPayload): Promise<void> {
  const change = await getChangeById(deps.db, payload.changeId);
  if (!change) {
    deps.log(`classify: change ${payload.changeId} not found — skipping`);
    return;
  }
  if (change.status !== "pending") {
    deps.log(`classify: change ${change.id} is ${change.status} — skipping`);
    return;
  }

  const context = await getPageContext(deps.db, change.pageId);
  if (!context) {
    deps.log(`classify: page context missing for change ${change.id} — skipping`);
    return;
  }

  let classification;
  try {
    classification = await deps.classify({
      competitorName: context.competitorName,
      pageKind: context.kind,
      pageUrl: context.url,
      heading: change.heading,
      sectionKind: change.sectionKind,
      changeType: change.changeType,
      diffSummary: change.diffSummary,
    });
  } catch (error) {
    if (error instanceof LlmParseError) await setChangeError(deps.db, change.id);
    throw error;
  }

  await setChangeClassification(deps.db, change.id, {
    category: classification.category,
    severity: classification.severity,
    headline: classification.headline,
    whyItMatters: classification.why_it_matters,
  });

  if (
    classification.severity >= ALERT_MIN_SEVERITY &&
    ALERT_CATEGORIES.has(classification.category)
  ) {
    await deps.enqueue({ queue: "alert", payload: { changeId: change.id } });
    deps.log(`classify: change ${change.id} → ${classification.category} sev${classification.severity} (ALERT)`);
  } else {
    deps.log(`classify: change ${change.id} → ${classification.category} sev${classification.severity}`);
  }
}
