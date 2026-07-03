import { describe, expect, it } from "vitest";

import { hashNormalized, normalizeText } from "../src/hash.js";

describe("normalizeText", () => {
  it("collapses whitespace and trims", () => {
    expect(normalizeText("  hello\n\t world  ")).toBe("hello world");
  });

  it("strips zero-width characters and unifies nbsp", () => {
    expect(normalizeText("pri​cing table")).toBe("pricing table");
  });
});

describe("hashNormalized", () => {
  it("is whitespace-insensitive", () => {
    expect(hashNormalized("a  b\nc")).toBe(hashNormalized("a b c"));
  });

  it("differs for different content", () => {
    expect(hashNormalized("$29")).not.toBe(hashNormalized("$39"));
  });
});
