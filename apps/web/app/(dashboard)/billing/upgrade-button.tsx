"use client";

import { createCheckoutAction } from "./actions";
import { Button } from "@/components/ui/button";
import type { PaidPlan } from "@/lib/lemonsqueezy";
import { useState, useTransition } from "react";

export function UpgradeButton({ plan, disabled }: { plan: PaidPlan; disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await createCheckoutAction(plan);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button onClick={handleClick} disabled={disabled || pending}>
        {pending ? "Redirecting…" : `Upgrade to ${plan === "starter" ? "Starter" : "Pro"}`}
      </Button>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
