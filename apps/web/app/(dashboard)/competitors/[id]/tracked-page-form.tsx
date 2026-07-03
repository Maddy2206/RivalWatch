"use client";

import { addTrackedPageAction, type ActionResult } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionState } from "react";

const initialState: ActionResult = {};

const PAGE_KINDS = ["pricing", "features", "changelog", "blog", "home", "custom"] as const;

export function TrackedPageForm({ competitorId }: { competitorId: string }) {
  const [state, formAction, pending] = useActionState(addTrackedPageAction, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="competitorId" value={competitorId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="url">Page URL</Label>
        <Input id="url" name="url" type="url" placeholder="https://acme.com/pricing" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="kind">Kind</Label>
        <select
          id="kind"
          name="kind"
          defaultValue="pricing"
          className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
        >
          {PAGE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Track page"}
      </Button>
      {state.error ? <p className="w-full text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
