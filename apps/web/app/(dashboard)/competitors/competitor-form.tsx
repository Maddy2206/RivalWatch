"use client";

import { addCompetitorAction, type ActionResult } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionState } from "react";

const initialState: ActionResult = {};

export function CompetitorForm() {
  const [state, formAction, pending] = useActionState(addCompetitorAction, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Competitor name</Label>
        <Input id="name" name="name" placeholder="Acme Inc." required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="domain">Domain</Label>
        <Input id="domain" name="domain" placeholder="acme.com" required />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add competitor"}
      </Button>
      {state.error ? <p className="w-full text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
