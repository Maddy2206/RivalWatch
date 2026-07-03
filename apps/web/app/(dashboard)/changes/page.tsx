import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { requireSession } from "@/lib/session";
import { getChangesForWorkspace, getDb } from "@rivalwatch/db";
import Link from "next/link";

const STATUS_TABS = ["classified", "pending", "noise", "all"] as const;
type StatusTab = (typeof STATUS_TABS)[number];

const SEVERITY_VARIANT = {
  1: "default",
  2: "default",
  3: "info",
  4: "warning",
  5: "destructive",
} as const;

export default async function ChangesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: rawStatus } = await searchParams;
  const status: StatusTab = STATUS_TABS.includes(rawStatus as StatusTab)
    ? (rawStatus as StatusTab)
    : "classified";

  const { workspace } = await requireSession();
  const changes = await getChangesForWorkspace(getDb(), workspace.id, {
    status: status === "all" ? undefined : status,
    limit: 100,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab}
            href={`/changes?status=${tab}`}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium capitalize",
              tab === status ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100",
            )}
          >
            {tab}
          </Link>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {changes.length === 0 ? (
          <p className="text-sm text-gray-500">
            {status === "all" ? "No changes yet." : `No ${status} changes yet.`}
          </p>
        ) : (
          changes.map((change) => (
            <Card key={change.id}>
              <CardContent className="flex items-start justify-between gap-4 py-4">
                <div className="flex flex-col gap-1">
                  <p className="font-medium text-gray-900">
                    {change.headline ?? `${change.changeType} change in ${change.heading ?? change.anchorKey}`}
                  </p>
                  {change.whyItMatters ? (
                    <p className="text-sm text-gray-600">{change.whyItMatters}</p>
                  ) : null}
                  <p className="text-xs text-gray-500">
                    {change.competitorName} · {change.pageUrl}
                    {change.category ? ` · ${change.category}` : ""}
                    {change.noiseRule ? ` · gated: ${change.noiseRule}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="default">{change.status}</Badge>
                  {change.severity ? (
                    <Badge variant={SEVERITY_VARIANT[change.severity as 1 | 2 | 3 | 4 | 5]}>
                      Severity {change.severity}
                    </Badge>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
