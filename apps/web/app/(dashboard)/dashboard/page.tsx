import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/session";
import {
  getChangesForWorkspace,
  getCompetitorsForWorkspace,
  getDegradedPagesForWorkspace,
  getDb,
} from "@rivalwatch/db";
import Link from "next/link";

const SEVERITY_VARIANT = {
  1: "default",
  2: "default",
  3: "info",
  4: "warning",
  5: "destructive",
} as const;

export default async function DashboardOverviewPage() {
  const { workspace } = await requireSession();
  const db = getDb();

  const [competitors, recentChanges, degradedPages] = await Promise.all([
    getCompetitorsForWorkspace(db, workspace.id),
    getChangesForWorkspace(db, workspace.id, { status: "classified", limit: 10 }),
    getDegradedPagesForWorkspace(db, workspace.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-500">Competitors tracked</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{competitors.length}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-500">Plan</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold capitalize">{workspace.plan}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-500">Degraded pages</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{degradedPages.length}</CardContent>
        </Card>
      </div>

      {degradedPages.length > 0 ? (
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-amber-900">
              {degradedPages.length} page{degradedPages.length === 1 ? "" : "s"} failing to crawl
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {degradedPages.map((page) => (
              <div key={page.pageId} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">
                  {page.competitorName} — {page.url}
                </span>
                <span className="text-amber-700">{page.failureCount} consecutive failures</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Recent changes</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {recentChanges.length === 0 ? (
            <p className="text-sm text-gray-500">
              No classified changes yet. Add a competitor to start tracking.
            </p>
          ) : (
            recentChanges.map((change) => (
              <div key={change.id} className="flex items-start justify-between gap-4 border-b border-gray-100 pb-3 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">{change.headline}</p>
                  <p className="text-xs text-gray-500">
                    {change.competitorName} · {change.category}
                  </p>
                </div>
                {change.severity ? (
                  <Badge variant={SEVERITY_VARIANT[change.severity as 1 | 2 | 3 | 4 | 5]}>
                    Severity {change.severity}
                  </Badge>
                ) : null}
              </div>
            ))
          )}
          <Link href="/changes" className="text-sm font-medium text-gray-900 underline">
            View all changes
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
