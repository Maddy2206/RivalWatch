import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/session";
import { getCompetitorById, getDb, getTrackedPagesForCompetitor } from "@rivalwatch/db";
import { notFound } from "next/navigation";
import { DeleteCompetitorButton } from "../delete-competitor-button";
import { PageRowActions } from "./page-row-actions";
import { TrackedPageForm } from "./tracked-page-form";

const STATUS_VARIANT = {
  active: "success",
  degraded: "destructive",
  paused: "default",
} as const;

export default async function CompetitorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { workspace } = await requireSession();
  const db = getDb();

  const competitor = await getCompetitorById(db, id);
  if (!competitor || competitor.workspaceId !== workspace.id) notFound();

  const pages = await getTrackedPagesForCompetitor(db, competitor.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{competitor.name}</h1>
          <p className="text-sm text-gray-500">{competitor.domain}</p>
        </div>
        <DeleteCompetitorButton competitorId={competitor.id} competitorName={competitor.name} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Track a new page</CardTitle>
        </CardHeader>
        <CardContent>
          <TrackedPageForm competitorId={competitor.id} />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {pages.length === 0 ? (
          <p className="text-sm text-gray-500">No pages tracked yet for this competitor.</p>
        ) : (
          pages.map((page) => (
            <Card key={page.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="font-medium text-gray-900">{page.url}</p>
                  <p className="text-sm text-gray-500">
                    {page.kind}
                    {page.status === "degraded"
                      ? ` · ${page.failureCount} consecutive failures`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={STATUS_VARIANT[page.status]}>{page.status}</Badge>
                  <PageRowActions pageId={page.id} status={page.status} />
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
