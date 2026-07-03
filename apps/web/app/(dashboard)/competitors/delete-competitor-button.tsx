"use client";

import { deleteCompetitorAction } from "./actions";
import { Button } from "@/components/ui/button";
import { useTransition } from "react";

export function DeleteCompetitorButton({
  competitorId,
  competitorName,
}: {
  competitorId: string;
  competitorName: string;
}) {
  const [pending, startTransition] = useTransition();

  function handleClick(event: React.MouseEvent) {
    // Stop the parent <Link> (on the list page) from navigating.
    event.preventDefault();
    event.stopPropagation();
    if (
      !confirm(
        `Delete ${competitorName}? This removes all its tracked pages and change history. This can't be undone.`,
      )
    ) {
      return;
    }
    startTransition(() => deleteCompetitorAction(competitorId));
  }

  return (
    <Button variant="destructive" size="sm" disabled={pending} onClick={handleClick}>
      {pending ? "Deleting…" : "Delete"}
    </Button>
  );
}
