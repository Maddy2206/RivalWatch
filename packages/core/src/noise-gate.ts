import type { NoiseVerdict, SectionChange } from "./types.js";

/**
 * Heuristic noise gate. Runs on every diff BEFORE any LLM call (invariant 4):
 * changes that are provably uninteresting (timestamps, counters, cookie copy,
 * punctuation shuffles) never reach classification. New noise patterns get a
 * rule here + a fixture test, not a prompt tweak.
 */

const MONTHS =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

const DATE_TIME_PATTERNS: RegExp[] = [
  /^\d{4}-\d{2}-\d{2}(?:t[\d:.]+z?)?$/i, // ISO date / datetime
  /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4},?$/, // 03/07/2026
  new RegExp(`^(?:${MONTHS})\\.?,?$`, "i"), // month name
  // day-of-month only with an ordinal or trailing comma ("3rd", "3,") — a bare
  // small integer is too often a real value (seats, hours, GB) to gate on.
  /^\d{1,2}(?:st|nd|rd|th),?$/,
  /^\d{1,2},$/,
  /^(?:19|20)\d{2},?$/, // year
  /^\d{1,2}:\d{2}(?::\d{2})?(?:am|pm)?,?$/i, // clock time
  /^(?:am|pm)$/i,
  /^(?:today|yesterday|now|ago|updated|last)$/i, // relative-time vocabulary
  /^(?:second|minute|hour|day|week|month|year)s?,?$/i,
  /^(?:a|an|few)$/i,
];

/**
 * Bare counters: "1,234", "12k", "3.4M+", "99+" — but NOT currency amounts,
 * and NOT plain small integers ("24", "48") which are too often a real value
 * (SLA hours, seats, GB) to gate on. Requires an actual counter marker:
 * thousands-comma grouping, a k/m suffix, or a trailing "+".
 */
const COUNTER_PATTERN = /^(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?[km]|\d+\+)$/i;

const COOKIE_TEXT = /\b(?:we use cookies|cookie policy|accept (?:all )?cookies|consent)\b/i;
const COPYRIGHT = /(?:©|\(c\)|copyright)/i;

function stripToComparable(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function isDateTimeToken(token: string): boolean {
  return DATE_TIME_PATTERNS.some((p) => p.test(token));
}

function isCounterToken(token: string): boolean {
  return COUNTER_PATTERN.test(token);
}

interface NoiseRule {
  name: string;
  isNoise(change: SectionChange): boolean;
}

const rules: NoiseRule[] = [
  {
    // Hash changed but letters+digits didn't: pure punctuation/casing shuffle.
    name: "punctuation-only",
    isNoise: (c) =>
      c.changeType === "modified" &&
      stripToComparable(c.before ?? "") === stripToComparable(c.after ?? ""),
  },
  {
    // Cookie/consent banner copy that slipped past extraction stripping.
    name: "cookie-banner",
    isNoise: (c) => {
      const text = `${c.heading ?? ""} ${c.after ?? c.before ?? ""}`;
      return COOKIE_TEXT.test(text) && text.length < 600;
    },
  },
  {
    // "Last updated Jan 3, 2026" → "Last updated Jul 1, 2026" and friends.
    // Pricing tables are exempt: anything changing there is a judgment call.
    name: "timestamp-only",
    isNoise: (c) => {
      if (c.sectionKind === "pricing_table") return false;
      const changed = [...c.removedTokens, ...c.addedTokens];
      return changed.length > 0 && changed.every(isDateTimeToken);
    },
  },
  {
    // View counts, star counts, "10k+ users". Never applied to pricing tables,
    // where a bare number changing is exactly what we care about.
    name: "counter-only",
    isNoise: (c) => {
      if (c.sectionKind === "pricing_table") return false;
      const changed = [...c.removedTokens, ...c.addedTokens];
      return changed.length > 0 && changed.every((t) => isCounterToken(t) || isDateTimeToken(t));
    },
  },
  {
    // Copyright-line year bumps: all changed tokens are years/dates in a © context.
    name: "copyright-year",
    isNoise: (c) => {
      const context = `${c.before ?? ""} ${c.after ?? ""}`;
      if (!COPYRIGHT.test(context)) return false;
      const changed = [...c.removedTokens, ...c.addedTokens];
      return changed.length > 0 && changed.every((t) => /^(?:19|20)\d{2},?$/.test(t));
    },
  },
];

/** Classify one section change as noise (with the rule that caught it) or signal. */
export function gateChange(change: SectionChange): NoiseVerdict {
  if ((change.before ?? "") === "" && (change.after ?? "") === "") {
    return { verdict: "noise", rule: "empty-change" };
  }
  for (const rule of rules) {
    if (rule.isNoise(change)) return { verdict: "noise", rule: rule.name };
  }
  return { verdict: "signal" };
}

/** Convenience: split a batch of changes into signal and noise. */
export function gateChanges(changes: SectionChange[]): {
  signal: SectionChange[];
  noise: { change: SectionChange; rule: string }[];
} {
  const signal: SectionChange[] = [];
  const noise: { change: SectionChange; rule: string }[] = [];
  for (const change of changes) {
    const verdict = gateChange(change);
    if (verdict.verdict === "signal") signal.push(change);
    else noise.push({ change, rule: verdict.rule ?? "unknown" });
  }
  return { signal, noise };
}
