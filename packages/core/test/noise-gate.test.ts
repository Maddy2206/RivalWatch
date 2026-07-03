import { describe, expect, it } from "vitest";

import { diffSnapshots } from "../src/diff.js";
import { extractSections } from "../src/extract.js";
import { gateChange, gateChanges } from "../src/noise-gate.js";
import type { SectionChange } from "../src/types.js";
import { fixture } from "./helpers.js";

function makeChange(before: string, after: string, overrides?: Partial<SectionChange>): SectionChange {
  const removed = before.split(/\s+/).filter((t) => !after.split(/\s+/).includes(t));
  const added = after.split(/\s+/).filter((t) => !before.split(/\s+/).includes(t));
  return {
    anchorKey: "test-section",
    changeType: "modified",
    sectionKind: "text",
    heading: "Test",
    before,
    after,
    diffSummary: "",
    removedTokens: removed,
    addedTokens: added,
    ...overrides,
  };
}

describe("gateChange fixtures (end-to-end through extract + diff)", () => {
  const before = extractSections(fixture("pricing-before.html"));

  it("gates a timestamp + view-counter bump as noise", () => {
    const after = extractSections(fixture("pricing-after-noise.html"));
    const changes = diffSnapshots(before, after);
    expect(changes.length).toBeGreaterThan(0);
    const { signal, noise } = gateChanges(changes);
    expect(signal).toEqual([]);
    expect(noise.length).toBe(changes.length);
  });

  it("lets a real price change through as signal", () => {
    const after = extractSections(fixture("pricing-after-price-change.html"));
    const { signal } = gateChanges(diffSnapshots(before, after));
    expect(signal).toHaveLength(1);
    expect(signal[0]!.sectionKind).toBe("pricing_table");
  });
});

describe("gateChange rules", () => {
  it("punctuation-only", () => {
    // "&" → "and" changes letters, so it must stay signal:
    const change = makeChange("Fast, reliable & secure.", "Fast reliable and secure");
    const punct = makeChange("Fast, reliable, secure.", "Fast reliable secure");
    expect(gateChange(punct)).toEqual({ verdict: "noise", rule: "punctuation-only" });
    expect(gateChange(change).verdict).toBe("signal");
  });

  it("timestamp-only", () => {
    const change = makeChange("Last updated January 3, 2026", "Last updated July 1, 2026");
    expect(gateChange(change)).toEqual({ verdict: "noise", rule: "timestamp-only" });
  });

  it("counter-only", () => {
    const change = makeChange("Trusted by 12,304 developers", "Trusted by 12,417 developers");
    expect(gateChange(change)).toEqual({ verdict: "noise", rule: "counter-only" });
  });

  it("counters in pricing tables are NOT noise", () => {
    const change = makeChange("Pro | 29 | 10 projects", "Pro | 39 | 10 projects", {
      sectionKind: "pricing_table",
    });
    expect(gateChange(change).verdict).toBe("signal");
  });

  it("copyright-year", () => {
    const change = makeChange("© 2025 Acme Inc.", "© 2026 Acme Inc.");
    expect(gateChange(change).verdict).toBe("noise");
  });

  it("cookie-banner", () => {
    const change = makeChange(
      "We use cookies to improve your experience.",
      "We use cookies to personalize content and ads.",
    );
    expect(gateChange(change)).toEqual({ verdict: "noise", rule: "cookie-banner" });
  });

  it("keeps real copy changes as signal", () => {
    const change = makeChange(
      "Email support on the Pro plan",
      "Priority phone support on the Pro plan",
    );
    expect(gateChange(change).verdict).toBe("signal");
  });

  it("keeps SLA-style numeric changes as signal (bare integers are not dates)", () => {
    const change = makeChange("Response within 24 hours", "Response within 48 hours");
    expect(gateChange(change).verdict).toBe("signal");
  });
});
