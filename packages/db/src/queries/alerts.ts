import { eq } from "drizzle-orm";

import type { Db } from "../client.js";
import { alerts } from "../schema.js";

export type AlertRow = typeof alerts.$inferSelect;

export async function createAlert(
  db: Db,
  input: { workspaceId: string; changeId: string; channel?: string },
): Promise<AlertRow> {
  const [row] = await db
    .insert(alerts)
    .values({
      workspaceId: input.workspaceId,
      changeId: input.changeId,
      channel: input.channel ?? "email",
    })
    .returning();
  if (!row) throw new Error("alert insert returned no row");
  return row;
}

export async function markAlertSent(db: Db, alertId: string): Promise<void> {
  await db.update(alerts).set({ sentAt: new Date() }).where(eq(alerts.id, alertId));
}
