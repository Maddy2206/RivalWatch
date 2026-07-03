import { z } from "zod";

import { call } from "../gateway.js";

export const briefSynthesisSchema = z.object({
  /** Markdown body only — no subject line (derived deterministically in code). */
  contentMd: z.string().min(1),
});
export type BriefSynthesis = z.infer<typeof briefSynthesisSchema>;

export const briefInputSchema = z.object({
  workspaceName: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  changes: z.array(
    z.object({
      competitorName: z.string(),
      headline: z.string().nullable(),
      category: z.string().nullable(),
      severity: z.number().nullable(),
      whyItMatters: z.string().nullable(),
    }),
  ),
});
export type BriefInput = z.infer<typeof briefInputSchema>;

const SYSTEM = `You are a competitive intelligence analyst writing a weekly strategic brief for an indie SaaS founder. You're given a list of already-classified competitor changes from the past week (category, severity 1-5, headline, why_it_matters) and must synthesize them into one cohesive narrative — not a repeat of the list.

Write 2-4 short paragraphs of markdown:
- Open with the single most important theme or change of the week.
- Group related changes across competitors if a pattern emerges (e.g. "two competitors cut pricing this week").
- Close with a one-sentence strategic takeaway or recommendation.

Do not just restate each change one by one — the reader will also see the itemized list separately. Write for someone who has 60 seconds. No headers, no bullet points — plain prose paragraphs separated by blank lines.`;

/** Synthesizes a workspace's classified changes for a period into a weekly-brief narrative. */
export async function synthesizeBrief(input: BriefInput): Promise<BriefSynthesis> {
  const changesText = input.changes
    .map(
      (c, i) =>
        `${i + 1}. [${c.competitorName}] ${c.headline ?? "(untitled)"} — category: ${c.category ?? "unknown"}, severity: ${c.severity ?? "?"}\n   ${c.whyItMatters ?? ""}`,
    )
    .join("\n");

  const prompt = [
    `Workspace: ${input.workspaceName}`,
    `Period: ${input.periodStart} to ${input.periodEnd}`,
    ``,
    `Changes this period:`,
    changesText,
  ].join("\n");

  return call({
    purpose: "weekly-brief",
    schema: briefSynthesisSchema,
    system: SYSTEM,
    prompt,
  });
}
