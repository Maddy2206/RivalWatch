import { changeCategorySchema } from "@rivalwatch/core";
import { z } from "zod";

import { call } from "../gateway.js";

export const classificationSchema = z.object({
  category: changeCategorySchema,
  severity: z.number().int().min(1).max(5),
  headline: z.string().min(1).max(200),
  why_it_matters: z.string().min(1).max(600),
});
export type Classification = z.infer<typeof classificationSchema>;

export const classifyInputSchema = z.object({
  competitorName: z.string(),
  pageKind: z.string(),
  pageUrl: z.string(),
  heading: z.string().nullable(),
  sectionKind: z.enum(["text", "pricing_table"]),
  changeType: z.enum(["added", "removed", "modified"]),
  /** Word diff with [-removed-] and {+added+} runs. */
  diffSummary: z.string(),
});
export type ClassifyInput = z.infer<typeof classifyInputSchema>;

const SYSTEM = `You are a competitive intelligence analyst for indie SaaS founders. You classify a single detected change on a competitor's website.

Categories:
- pricing: price amounts, billing periods, discounts, free-tier limits changing value
- packaging: plan structure, feature-to-plan mapping, tier additions/removals, usage limits moved between plans
- feature: product capabilities added, removed, or changed
- messaging: positioning, value proposition, target-audience, or brand language shifts
- content: blog posts, docs, SEO copy, testimonials — informational content
- legal: terms of service, privacy policy, compliance claims
- other: anything that fits none of the above

Severity (1-5):
1 = trivial (typo fixes, minor copy polish)
2 = minor (small content updates, low-impact wording)
3 = notable (new feature mention, messaging shift worth knowing)
4 = important (price change, plan restructure, major feature launch)
5 = critical (dramatic price move, new/killed product line, direct competitive attack)

Write the headline as one crisp sentence a founder can scan (e.g. "Acme raised Pro from $29 to $39/mo"). Write why_it_matters as 1-2 sentences of strategic implication, not a restatement of the diff.`;

export async function classifyChange(input: ClassifyInput): Promise<Classification> {
  const prompt = [
    `Competitor: ${input.competitorName}`,
    `Page: ${input.pageUrl} (kind: ${input.pageKind})`,
    `Section: ${input.heading ?? "(no heading)"} [${input.sectionKind}]`,
    `Change type: ${input.changeType}`,
    ``,
    `Diff ([-removed-] {+added+}):`,
    input.diffSummary,
  ].join("\n");

  return call({
    purpose: "classify-change",
    schema: classificationSchema,
    system: SYSTEM,
    prompt,
  });
}
