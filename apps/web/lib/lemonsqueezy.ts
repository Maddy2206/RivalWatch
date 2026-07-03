/** The only file that may import @lemonsqueezy/lemonsqueezy.js. */
import { createCheckout, getSubscription, lemonSqueezySetup } from "@lemonsqueezy/lemonsqueezy.js";
import { loadEnv, requireEnv } from "@rivalwatch/config";

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  lemonSqueezySetup({ apiKey: requireEnv("LEMONSQUEEZY_API_KEY") });
  configured = true;
}

export type PaidPlan = "starter" | "pro";

function variantIdForPlan(plan: PaidPlan): string {
  return plan === "starter"
    ? requireEnv("LEMONSQUEEZY_STARTER_VARIANT_ID")
    : requireEnv("LEMONSQUEEZY_PRO_VARIANT_ID");
}

/** Creates a Lemon Squeezy checkout and returns its URL. workspaceId round-trips via checkoutData.custom. */
export async function createCheckoutUrl(workspaceId: string, plan: PaidPlan): Promise<string> {
  ensureConfigured();
  const env = loadEnv();
  const storeId = requireEnv("LEMONSQUEEZY_STORE_ID");
  const variantId = variantIdForPlan(plan);

  const result = await createCheckout(storeId, variantId, {
    checkoutData: { custom: { workspaceId } },
    productOptions: { redirectUrl: `${env.APP_URL}/billing?success=1` },
  });

  const url = result.data?.data.attributes.url;
  if (!url) {
    throw new Error(`Failed to create Lemon Squeezy checkout: ${result.error?.message ?? "unknown error"}`);
  }
  return url;
}

/** The customer-portal URL for an existing subscription, or null if unavailable. */
export async function getCustomerPortalUrl(subscriptionId: string): Promise<string | null> {
  ensureConfigured();
  const result = await getSubscription(subscriptionId);
  return result.data?.data.attributes.urls.customer_portal ?? null;
}
