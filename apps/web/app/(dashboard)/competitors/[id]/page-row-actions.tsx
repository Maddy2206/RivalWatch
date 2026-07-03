"use client";

import { pausePageAction, reactivatePageAction } from "../actions";
import { Button } from "@/components/ui/button";
import { useTransition } from "react";

export function PageRowActions({ pageId, status }: { pageId: string; status: string }) {
  const [pending, startTransition] = useTransition();

  if (status === "paused" || status === "degraded") {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => startTransition(() => reactivatePageAction(pageId))}
      >
        {pending ? "…" : "Reactivate"}
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => pausePageAction(pageId))}
    >
      {pending ? "…" : "Pause"}
    </Button>
  );
}
