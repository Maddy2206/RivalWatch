import { describe, expect, it } from "vitest";

import { EXTRACT_VERSION, extractSections } from "../src/extract.js";
import { fixture } from "./helpers.js";

describe("extractSections", () => {
  const result = extractSections(fixture("pricing-before.html"));

  it("stamps the current extract version", () => {
    expect(result.extractVersion).toBe(EXTRACT_VERSION);
  });

  it("produces heading-anchored text sections", () => {
    const anchors = result.sections.map((s) => s.anchorKey);
    expect(anchors).toContain("simple-transparent-pricing");
    expect(anchors).toContain("frequently-asked-questions");
  });

  it("detects the pricing card grid as a pricing_table section", () => {
    const pricing = result.sections.find((s) => s.kind === "pricing_table");
    expect(pricing).toBeDefined();
    expect(pricing!.anchorKey).toBe("pricing:plans");
    expect(pricing!.normalizedText).toContain("Pro | $29/mo");
    expect(pricing!.normalizedText).toContain("Team | $79/mo");
  });

  it("strips nav, footer, scripts, styles, and cookie banners", () => {
    const allText = result.sections.map((s) => s.normalizedText).join(" ");
    expect(allText).not.toContain("Docs"); // nav
    expect(allText).not.toContain("All rights reserved"); // footer
    expect(allText).not.toContain("analytics"); // script
    expect(allText).not.toContain("border"); // style
    expect(allText).not.toContain("We use cookies"); // banner
  });

  it("is stable across whitespace and formatting differences", () => {
    const reformatted = extractSections(fixture("pricing-before-reformatted.html"));
    const hashes = (r: typeof result) => r.sections.map((s) => [s.anchorKey, s.textHash]);
    expect(hashes(reformatted)).toEqual(hashes(result));
  });

  it("assigns sequential positions", () => {
    expect(result.sections.map((s) => s.position)).toEqual(
      result.sections.map((_, i) => i),
    );
  });
});
