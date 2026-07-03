"use server";

import { createCheckoutUrl, type PaidPlan } from "@/lib/lemonsqueezy";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export interface CheckoutActionResult {
  error?: string;
}

export async function createCheckoutAction(plan: PaidPlan): Promise<CheckoutActionResult> {
  const { workspace } = await requireSession();

  let url: string;
  try {
    url = await createCheckoutUrl(workspace.id, plan);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to start checkout." };
  }
  redirect(url);
}
