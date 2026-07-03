import { describe, expect, it } from "vitest";

import { diffSnapshots, diffWords } from "../src/diff.js";
import { ExtractVersionMismatchError } from "../src/errors.js";
import { extractSections } from "../src/extract.js";
import { fixture } from "./helpers.js";

describe("diffWords", () => {
  it("marks removed and added runs", () => {
    const diff = diffWords("Pro plan costs $29 per month", "Pro plan costs $39 per month");
    expect(diff.summary).toBe("Pro plan costs [-$29-] {+$39+} per month");
    expect(diff.removedTokens).toEqual(["$29"]);
    expect(diff.addedTokens).toEqual(["$39"]);
  });

  it("handles pure additions and removals", () => {
    expect(diffWords("", "brand new").addedTokens).toEqual(["brand", "new"]);
    expect(diffWords("gone now", "").removedTokens).toEqual(["gone", "now"]);
  });
});

describe("diffSnapshots", () => {
  const before = extractSections(fixture("pricing-before.html"));

  it("returns no changes for identical snapshots", () => {
    expect(diffSnapshots(before, before)).toEqual([]);
  });

  it("detects a price change as a modified pricing_table section", () => {
    const after = extractSections(fixture("pricing-after-price-change.html"));
    const changes = diffSnapshots(before, after);
    expect(changes).toHaveLength(1);
    const change = changes[0]!;
    expect(change.changeType).toBe("modified");
    expect(change.sectionKind).toBe("pricing_table");
    expect(change.anchorKey).toBe("pricing:plans");
    expect(change.diffSummary).toContain("[-$29/mo-]");
    expect(change.diffSummary).toContain("{+$39/mo+}");
  });

  it("detects added and removed sections", () => {
    const after = {
      ...before,
      sections: before.sections
        .filter((s) => s.anchorKey !== "frequently-asked-questions")
        .concat({
          anchorKey: "enterprise",
          kind: "text" as const,
          heading: "Enterprise",
          position: 99,
          normalizedText: "Enterprise Contact us for custom pricing",
          textHash: "0".repeat(64),
        }),
    };
    const changes = diffSnapshots(before, after);
    const types = changes.map((c) => [c.changeType, c.anchorKey]);
    expect(types).toContainEqual(["removed", "frequently-asked-questions"]);
    expect(types).toContainEqual(["added", "enterprise"]);
  });

  it("refuses to diff across extract versions", () => {
    const older = { ...before, extractVersion: before.extractVersion - 1 };
    expect(() => diffSnapshots(older, before)).toThrow(ExtractVersionMismatchError);
  });
});
