import { loadEnv, requireEnv } from "@rivalwatch/config";
import { getDb, setWorkspaceSubscription } from "@rivalwatch/db";
import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

interface LemonSqueezyEvent {
  meta: {
    event_name: string;
    custom_data?: { workspaceId?: string };
  };
  data: {
    id: string;
    attributes: {
      variant_id: number;
      customer_id: number;
      status: string;
    };
  };
}

function verifySignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(signatureHeader, "utf8");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

function planForVariantId(variantId: number): "starter" | "pro" | null {
  const env = loadEnv();
  const variantStr = String(variantId);
  if (variantStr === env.LEMONSQUEEZY_STARTER_VARIANT_ID) return "starter";
  if (variantStr === env.LEMONSQUEEZY_PRO_VARIANT_ID) return "pro";
  return null;
}

export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();
  const secret = requireEnv("LEMONSQUEEZY_WEBHOOK_SECRET");

  if (!verifySignature(rawBody, request.headers.get("x-signature"), secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let event: LemonSqueezyEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const workspaceId = event.meta.custom_data?.workspaceId;
  if (!workspaceId) {
    // Not every LS event carries our custom data (e.g. test pings) — accept and no-op.
    return NextResponse.json({ ok: true });
  }

  const db = getDb();

  switch (event.meta.event_name) {
    case "subscription_created":
    case "subscription_updated": {
      const plan = planForVariantId(event.data.attributes.variant_id);
      if (!plan) break; // unknown variant — don't touch the workspace's plan
      await setWorkspaceSubscription(db, workspaceId, {
        plan,
        lemonSqueezyCustomerId: String(event.data.attributes.customer_id),
        lemonSqueezySubscriptionId: event.data.id,
        subscriptionStatus: event.data.attributes.status,
      });
      break;
    }
    case "subscription_cancelled":
    case "subscription_expired": {
      // Simplification: downgrades immediately rather than at period end.
      await setWorkspaceSubscription(db, workspaceId, {
        plan: "free",
        lemonSqueezyCustomerId: String(event.data.attributes.customer_id),
        lemonSqueezySubscriptionId: event.data.id,
        subscriptionStatus: event.data.attributes.status,
      });
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ ok: true });
}
