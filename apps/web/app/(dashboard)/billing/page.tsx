import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCustomerPortalUrl } from "@/lib/lemonsqueezy";
import { requireSession } from "@/lib/session";
import { hasLemonSqueezyConfigured } from "@rivalwatch/config";
import { countCompetitors, countTrackedPages, getDb, PLAN_LIMITS, type Plan } from "@rivalwatch/db";
import { UpgradeButton } from "./upgrade-button";

const PLAN_LABEL: Record<Plan, string> = { free: "Free", starter: "Starter", pro: "Pro" };

export default async function BillingPage() {
  const { workspace } = await requireSession();
  const db = getDb();

  const [competitorsUsed, pagesUsed] = await Promise.all([
    countCompetitors(db, workspace.id),
    countTrackedPages(db, workspace.id),
  ]);
  const limits = PLAN_LIMITS[workspace.plan];
  const lemonSqueezyReady = hasLemonSqueezyConfigured();

  const portalUrl = workspace.lemonSqueezySubscriptionId
    ? await getCustomerPortalUrl(workspace.lemonSqueezySubscriptionId)
    : null;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Current plan</CardTitle>
            <Badge variant={workspace.plan === "free" ? "default" : "success"}>
              {PLAN_LABEL[workspace.plan]}
            </Badge>
          </div>
          {workspace.subscriptionStatus ? (
            <CardDescription>Subscription status: {workspace.subscriptionStatus}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <UsageBar label="Competitors" used={competitorsUsed} limit={limits.competitors} />
          <UsageBar label="Tracked pages" used={pagesUsed} limit={limits.pages} />
          {portalUrl ? (
            <a href={portalUrl} className="text-sm font-medium text-gray-900 underline">
              Manage subscription
            </a>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <PlanCard
          name="Starter"
          price="$19/mo"
          limits={PLAN_LIMITS.starter}
          current={workspace.plan === "starter"}
          action={<UpgradeButton plan="starter" disabled={!lemonSqueezyReady || workspace.plan === "starter"} />}
        />
        <PlanCard
          name="Pro"
          price="$49/mo"
          limits={PLAN_LIMITS.pro}
          current={workspace.plan === "pro"}
          action={<UpgradeButton plan="pro" disabled={!lemonSqueezyReady || workspace.plan === "pro"} />}
        />
      </div>

      {!lemonSqueezyReady ? (
        <p className="text-sm text-gray-500">
          Billing isn&apos;t configured yet — set LEMONSQUEEZY_API_KEY and the store/variant IDs to enable
          upgrades.
        </p>
      ) : null}
    </div>
  );
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  return (
    <div>
      <div className="flex justify-between text-sm text-gray-600">
        <span>{label}</span>
        <span>
          {used} of {limit} used
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100">
        <div
          className={`h-1.5 rounded-full ${pct >= 100 ? "bg-red-500" : "bg-gray-900"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function PlanCard({
  name,
  price,
  limits,
  current,
  action,
}: {
  name: string;
  price: string;
  limits: { competitors: number; pages: number };
  current: boolean;
  action: React.ReactNode;
}) {
  return (
    <Card className={current ? "border-gray-900" : undefined}>
      <CardHeader>
        <CardTitle>{name}</CardTitle>
        <CardDescription>{price}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="text-sm text-gray-600">
          <li>{limits.competitors} competitors</li>
          <li>{limits.pages} tracked pages</li>
        </ul>
        {current ? <Badge variant="success">Current plan</Badge> : action}
      </CardContent>
    </Card>
  );
}
