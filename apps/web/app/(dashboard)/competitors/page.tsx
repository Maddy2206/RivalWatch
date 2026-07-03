import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/session";
import { getCompetitorsForWorkspace, getDb, PLAN_LIMITS } from "@rivalwatch/db";
import Link from "next/link";
import { CompetitorForm } from "./competitor-form";
import { DeleteCompetitorButton } from "./delete-competitor-button";

export default async function CompetitorsPage() {
  const { workspace } = await requireSession();
  const competitors = await getCompetitorsForWorkspace(getDb(), workspace.id);
  const limit = PLAN_LIMITS[workspace.plan].competitors;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>
          {competitors.length} of {limit} competitors used
        </span>
        {competitors.length >= limit ? (
          <Link href="/billing" className="font-medium text-gray-900 underline">
            Upgrade for more
          </Link>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add a competitor</CardTitle>
        </CardHeader>
        <CardContent>
          <CompetitorForm />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {competitors.length === 0 ? (
          <p className="text-sm text-gray-500">No competitors yet — add one above to start tracking.</p>
        ) : (
          competitors.map((competitor) => (
            <Link key={competitor.id} href={`/competitors/${competitor.id}`}>
              <Card className="transition-colors hover:border-gray-300">
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="font-medium text-gray-900">{competitor.name}</p>
                    <p className="text-sm text-gray-500">{competitor.domain}</p>
                  </div>
                  <DeleteCompetitorButton
                    competitorId={competitor.id}
                    competitorName={competitor.name}
                  />
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
