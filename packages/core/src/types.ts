import { z } from "zod";

export const sectionKindSchema = z.enum(["text", "pricing_table"]);
export type SectionKind = z.infer<typeof sectionKindSchema>;

export const sectionSchema = z.object({
  /** Stable identifier for matching sections across snapshots (heading slug or pricing anchor). */
  anchorKey: z.string().min(1),
  kind: sectionKindSchema,
  heading: z.string().nullable(),
  /** 0-based order of the section within the page. */
  position: z.number().int().nonnegative(),
  normalizedText: z.string(),
  /** sha256 of normalizedText — the unit of change detection. */
  textHash: z.string().length(64),
});
export type Section = z.infer<typeof sectionSchema>;

export const extractResultSchema = z.object({
  extractVersion: z.number().int().positive(),
  sections: z.array(sectionSchema),
});
export type ExtractResult = z.infer<typeof extractResultSchema>;

export const changeTypeSchema = z.enum(["added", "removed", "modified"]);
export type ChangeType = z.infer<typeof changeTypeSchema>;

export const changeCategorySchema = z.enum([
  "pricing",
  "packaging",
  "feature",
  "messaging",
  "content",
  "legal",
  "other",
]);
export type ChangeCategory = z.infer<typeof changeCategorySchema>;

export const severitySchema = z.number().int().min(1).max(5);
export type Severity = z.infer<typeof severitySchema>;

export const sectionChangeSchema = z.object({
  anchorKey: z.string(),
  changeType: changeTypeSchema,
  sectionKind: sectionKindSchema,
  heading: z.string().nullable(),
  /** Normalized text of the section before the change (null when added). */
  before: z.string().nullable(),
  /** Normalized text of the section after the change (null when removed). */
  after: z.string().nullable(),
  /** Human-readable word diff: unchanged text with [-removed-] and {+added+} runs. */
  diffSummary: z.string(),
  removedTokens: z.array(z.string()),
  addedTokens: z.array(z.string()),
});
export type SectionChange = z.infer<typeof sectionChangeSchema>;

export const noiseVerdictSchema = z.object({
  verdict: z.enum(["noise", "signal"]),
  /** Name of the heuristic that flagged the change, when verdict is "noise". */
  rule: z.string().optional(),
});
export type NoiseVerdict = z.infer<typeof noiseVerdictSchema>;
