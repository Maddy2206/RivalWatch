import { ExtractVersionMismatchError } from "./errors.js";
import type { ExtractResult, Section, SectionChange } from "./types.js";

/** Above this (before × after) token product we skip LCS and fall back to whole-text replacement. */
const MAX_LCS_CELLS = 500_000;
const MAX_SUMMARY_LENGTH = 4_000;

interface WordDiff {
  summary: string;
  removedTokens: string[];
  addedTokens: string[];
}

function tokenize(text: string): string[] {
  return text.split(/\s+/).filter((t) => t.length > 0);
}

/**
 * Word-level diff via LCS. Emits a readable summary — shared text with
 * [-removed-] and {+added+} runs — plus the raw changed tokens for the
 * noise gate.
 */
export function diffWords(before: string, after: string): WordDiff {
  const a = tokenize(before);
  const b = tokenize(after);

  if (a.length * b.length > MAX_LCS_CELLS) {
    return {
      summary: truncate(`[-${before}-] {+${after}+}`),
      removedTokens: a,
      addedTokens: b,
    };
  }

  // LCS lengths table
  const rows = a.length + 1;
  const cols = b.length + 1;
  const lcs = new Uint32Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * cols + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * cols + j + 1]! + 1
          : Math.max(lcs[(i + 1) * cols + j]!, lcs[i * cols + j + 1]!);
    }
  }

  const parts: string[] = [];
  const removedTokens: string[] = [];
  const addedTokens: string[] = [];
  let i = 0;
  let j = 0;
  let removedRun: string[] = [];
  let addedRun: string[] = [];

  const flushRuns = (): void => {
    if (removedRun.length > 0) parts.push(`[-${removedRun.join(" ")}-]`);
    if (addedRun.length > 0) parts.push(`{+${addedRun.join(" ")}+}`);
    removedRun = [];
    addedRun = [];
  };

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      flushRuns();
      parts.push(a[i]!);
      i++;
      j++;
    } else if (lcs[(i + 1) * cols + j]! >= lcs[i * cols + j + 1]!) {
      removedRun.push(a[i]!);
      removedTokens.push(a[i]!);
      i++;
    } else {
      addedRun.push(b[j]!);
      addedTokens.push(b[j]!);
      j++;
    }
  }
  for (; i < a.length; i++) {
    removedRun.push(a[i]!);
    removedTokens.push(a[i]!);
  }
  for (; j < b.length; j++) {
    addedRun.push(b[j]!);
    addedTokens.push(b[j]!);
  }
  flushRuns();

  return { summary: truncate(parts.join(" ")), removedTokens, addedTokens };
}

function truncate(text: string): string {
  return text.length <= MAX_SUMMARY_LENGTH ? text : `${text.slice(0, MAX_SUMMARY_LENGTH)}…`;
}

/**
 * Diff two extracted snapshots section-by-section. Sections match on
 * anchorKey; hash equality means unchanged. Throws if the snapshots were
 * produced by different extraction versions (invariant: never diff across
 * extract_version boundaries — re-extract from raw HTML first).
 */
export function diffSnapshots(before: ExtractResult, after: ExtractResult): SectionChange[] {
  if (before.extractVersion !== after.extractVersion) {
    throw new ExtractVersionMismatchError(before.extractVersion, after.extractVersion);
  }

  const beforeByKey = new Map(before.sections.map((s) => [s.anchorKey, s]));
  const afterByKey = new Map(after.sections.map((s) => [s.anchorKey, s]));
  const changes: SectionChange[] = [];

  for (const section of before.sections) {
    if (!afterByKey.has(section.anchorKey)) {
      changes.push(makeChange("removed", section, null));
    }
  }

  for (const section of after.sections) {
    const prev = beforeByKey.get(section.anchorKey);
    if (!prev) {
      changes.push(makeChange("added", null, section));
    } else if (prev.textHash !== section.textHash) {
      changes.push(makeChange("modified", prev, section));
    }
  }

  return changes;
}

function makeChange(
  changeType: SectionChange["changeType"],
  before: Section | null,
  after: Section | null,
): SectionChange {
  const section = (after ?? before)!;
  const diff = diffWords(before?.normalizedText ?? "", after?.normalizedText ?? "");
  return {
    anchorKey: section.anchorKey,
    changeType,
    sectionKind: section.kind,
    heading: section.heading,
    before: before?.normalizedText ?? null,
    after: after?.normalizedText ?? null,
    diffSummary: diff.summary,
    removedTokens: diff.removedTokens,
    addedTokens: diff.addedTokens,
  };
}
