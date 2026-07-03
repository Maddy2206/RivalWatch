import { describe, expect, it } from "vitest";

import { isAllowed } from "../src/robots.js";

const ROBOTS = `
# example robots
User-agent: *
Disallow: /admin
Allow: /admin/public
Disallow: /private/*.html$

User-agent: BadBot
Disallow: /
`;

describe("isAllowed", () => {
  it("allows everything on empty robots.txt", () => {
    expect(isAllowed("", "https://example.com/anything")).toBe(true);
  });

  it("applies wildcard group disallow rules", () => {
    expect(isAllowed(ROBOTS, "https://example.com/admin/settings")).toBe(false);
    expect(isAllowed(ROBOTS, "https://example.com/pricing")).toBe(true);
  });

  it("longest match wins: allow overrides broader disallow", () => {
    expect(isAllowed(ROBOTS, "https://example.com/admin/public/page")).toBe(true);
  });

  it("supports * and $ in paths", () => {
    expect(isAllowed(ROBOTS, "https://example.com/private/doc.html")).toBe(false);
    expect(isAllowed(ROBOTS, "https://example.com/private/doc.html?x=1")).toBe(true);
  });

  it("matches specific user-agent groups by substring", () => {
    expect(isAllowed(ROBOTS, "https://example.com/pricing", "BadBot/1.0")).toBe(false);
    expect(isAllowed(ROBOTS, "https://example.com/pricing", "RivalWatchBot")).toBe(true);
  });

  it("rejects unparseable URLs", () => {
    expect(isAllowed(ROBOTS, "not a url")).toBe(false);
  });
});
