"use server";

import { requireSession } from "@/lib/session";
import {
  addCompetitor,
  addTrackedPage,
  deleteCompetitor,
  getCompetitorById,
  getDb,
  getPageById,
  getWorkspaceIdForPage,
  pausePage,
  reactivatePage,
} from "@rivalwatch/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export interface ActionResult {
  error?: string;
}

export async function addCompetitorAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { workspace } = await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  const domain = String(formData.get("domain") ?? "").trim();
  if (!name || !domain) return { error: "Name and domain are required." };

  try {
    await addCompetitor(getDb(), workspace.id, { name, domain });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to add competitor." };
  }
  revalidatePath("/competitors");
  return {};
}

export async function addTrackedPageAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { workspace } = await requireSession();
  const competitorId = String(formData.get("competitorId") ?? "");
  const url = String(formData.get("url") ?? "").trim();
  const kind = String(formData.get("kind") ?? "custom") as
    | "pricing"
    | "features"
    | "changelog"
    | "blog"
    | "home"
    | "custom";
  if (!competitorId || !url) return { error: "URL is required." };

  try {
    await addTrackedPage(getDb(), workspace.id, competitorId, { url, kind });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to add page." };
  }
  revalidatePath(`/competitors/${competitorId}`);
  return {};
}

async function assertPageOwnership(pageId: string, workspaceId: string): Promise<void> {
  const pageWorkspaceId = await getWorkspaceIdForPage(getDb(), pageId);
  if (pageWorkspaceId !== workspaceId) {
    throw new Error(`Page ${pageId} does not belong to workspace ${workspaceId}`);
  }
}

export async function pausePageAction(pageId: string): Promise<void> {
  const { workspace } = await requireSession();
  await assertPageOwnership(pageId, workspace.id);
  await pausePage(getDb(), pageId);
  const page = await getPageById(getDb(), pageId);
  if (page) revalidatePath(`/competitors/${page.competitorId}`);
}

export async function reactivatePageAction(pageId: string): Promise<void> {
  const { workspace } = await requireSession();
  await assertPageOwnership(pageId, workspace.id);
  await reactivatePage(getDb(), pageId);
  const page = await getPageById(getDb(), pageId);
  if (page) revalidatePath(`/competitors/${page.competitorId}`);
}

/**
 * Deletes a competitor and everything tracked under it. Irreversible — all
 * tracked pages, snapshots, and change history for it are gone too.
 */
export async function deleteCompetitorAction(competitorId: string): Promise<void> {
  const { workspace } = await requireSession();
  const db = getDb();
  const competitor = await getCompetitorById(db, competitorId);
  if (!competitor || competitor.workspaceId !== workspace.id) {
    throw new Error(`Competitor ${competitorId} does not belong to workspace ${workspace.id}`);
  }
  await deleteCompetitor(db, competitorId);
  revalidatePath("/competitors");
  redirect("/competitors");
}
