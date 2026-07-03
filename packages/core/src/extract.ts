import type { HTMLElement as ParsedElement, Node as ParsedNode } from "node-html-parser";
import { parse, NodeType } from "node-html-parser";

import { hashNormalized, normalizeText } from "./hash.js";
import type { ExtractResult, Section, SectionKind } from "./types.js";

/**
 * Bump this whenever extraction logic changes in a way that alters output for
 * the same HTML. Snapshots with different versions must never be diffed —
 * re-extract the older snapshot from its archived raw HTML first.
 */
export const EXTRACT_VERSION = 1;

const CHROME_SELECTORS = ["script", "style", "noscript", "svg", "iframe", "nav", "footer", "template", "form"];
const COOKIE_HINT = /\b(cookie|consent|gdpr)\b/i;
const HEADING_TAGS = new Set(["H1", "H2", "H3"]);
// $ € £ ₹ amounts, or amounts followed by a currency code
const CURRENCY = /(?:[$€£₹]\s?\d[\d,]*(?:\.\d+)?)|(?:\d[\d,]*(?:\.\d+)?\s?(?:USD|EUR|GBP|INR)\b)/g;
const MAX_CARD_TEXT = 1200;

function isElement(node: ParsedNode): node is ParsedElement {
  return node.nodeType === NodeType.ELEMENT_NODE;
}

function currencyCount(text: string): number {
  return text.match(CURRENCY)?.length ?? 0;
}

function slugify(text: string): string {
  const slug = normalizeText(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "untitled";
}

function stripChrome(body: ParsedElement): void {
  for (const selector of CHROME_SELECTORS) {
    for (const node of body.querySelectorAll(selector)) node.remove();
  }
  // Cookie/consent banners: identified by class or id, removed before sectioning
  // so their ever-changing copy never reaches the diff.
  for (const node of body.querySelectorAll("*")) {
    const classAndId = `${node.getAttribute("class") ?? ""} ${node.getAttribute("id") ?? ""}`;
    if (COOKIE_HINT.test(classAndId)) node.remove();
  }
}

/** A <table> with several currency amounts is treated as a pricing table. */
function isPricingTable(el: ParsedElement): boolean {
  return el.tagName === "TABLE" && currencyCount(el.text) >= 2;
}

/**
 * A pricing card grid: an element with >=2 direct children where at least two
 * (and at least half) are compact blocks containing a currency amount.
 */
function isPricingCardGrid(el: ParsedElement): boolean {
  if (el.tagName === "TABLE") return false;
  const kids = el.childNodes.filter(isElement);
  if (kids.length < 2) return false;
  const cards = kids.filter(
    (k) => currencyCount(k.text) >= 1 && normalizeText(k.text).length <= MAX_CARD_TEXT,
  );
  return cards.length >= 2 && cards.length / kids.length >= 0.5;
}

function tableToRows(table: ParsedElement): string[] {
  return table
    .querySelectorAll("tr")
    .map((tr) =>
      tr
        .querySelectorAll("td, th")
        .map((cell) => normalizeText(cell.text))
        .filter((t) => t.length > 0)
        .join(" | "),
    )
    .filter((row) => row.length > 0);
}

function cardGridToRows(grid: ParsedElement): string[] {
  return grid.childNodes
    .filter(isElement)
    .map((card) =>
      card.structuredText
        .split("\n")
        .map((line) => normalizeText(line))
        .filter((line) => line.length > 0)
        .join(" | "),
    )
    .filter((row) => row.length > 0);
}

function isDescendantOf(node: ParsedElement, ancestor: ParsedElement): boolean {
  let current: ParsedNode | null = node.parentNode;
  while (current) {
    if (current === ancestor) return true;
    current = current.parentNode;
  }
  return false;
}

/**
 * Find pricing nodes (tables and card grids). For grids, keep only the
 * deepest matching container so a page-level wrapper doesn't swallow the page.
 */
function findPricingNodes(body: ParsedElement): Set<ParsedElement> {
  const tables = body.querySelectorAll("table").filter(isPricingTable);
  const grids = body.querySelectorAll("*").filter(isPricingCardGrid);
  const deepestGrids = grids.filter(
    (g) => !grids.some((other) => other !== g && isDescendantOf(other, g)),
  );
  // A grid that lives inside a claimed table (or vice versa) is redundant.
  const nodes = [
    ...tables,
    ...deepestGrids.filter(
      (g) => !tables.some((t) => isDescendantOf(g, t) || isDescendantOf(t, g)),
    ),
  ];
  return new Set(nodes);
}

interface SectionDraft {
  anchorKey: string;
  kind: SectionKind;
  heading: string | null;
  text: string;
}

class SectionCollector {
  private drafts: SectionDraft[] = [];
  private usedAnchors = new Map<string, number>();
  private currentHeading: string | null = null;
  private currentAnchor = "intro";
  private buffer: string[] = [];

  private uniqueAnchor(base: string): string {
    const seen = this.usedAnchors.get(base) ?? 0;
    this.usedAnchors.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen + 1}`;
  }

  startSection(heading: string): void {
    this.flush();
    this.currentHeading = normalizeText(heading);
    this.currentAnchor = this.uniqueAnchor(slugify(heading));
    this.buffer = [this.currentHeading];
  }

  addText(text: string): void {
    this.buffer.push(text);
  }

  addPricing(rows: string[]): void {
    if (rows.length === 0) return;
    const base = this.currentHeading ? `pricing:${slugify(this.currentHeading)}` : "pricing-table";
    this.drafts.push({
      anchorKey: this.uniqueAnchor(base),
      kind: "pricing_table",
      heading: this.currentHeading,
      text: rows.join("\n"),
    });
  }

  flush(): void {
    const text = normalizeText(this.buffer.join(" "));
    // A heading with no body is still a section (its text is the heading itself).
    if (text.length > 0) {
      this.drafts.push({
        anchorKey: this.currentAnchor,
        kind: "text",
        heading: this.currentHeading,
        text,
      });
    }
    this.buffer = [];
  }

  toSections(): Section[] {
    return this.drafts.map((d, position) => ({
      anchorKey: d.anchorKey,
      kind: d.kind,
      heading: d.heading,
      position,
      normalizedText: d.kind === "pricing_table" ? d.text : normalizeText(d.text),
      textHash: hashNormalized(d.text),
    }));
  }
}

/**
 * Extract semantic sections from raw HTML. Pure: string in, sections out.
 * Sections are heading-anchored (h1–h3) text blocks plus detected pricing
 * tables; each carries a normalized-text hash used as the unit of diffing.
 */
export function extractSections(html: string): ExtractResult {
  const root = parse(html, {
    blockTextElements: { script: false, style: false, noscript: false, pre: true },
  });
  const body = root.querySelector("body") ?? root;
  stripChrome(body);

  const pricingNodes = findPricingNodes(body);
  const collector = new SectionCollector();

  const walk = (node: ParsedNode): void => {
    if (node.nodeType === NodeType.TEXT_NODE) {
      const text = normalizeText(node.text);
      if (text.length > 0) collector.addText(text);
      return;
    }
    if (!isElement(node)) return;
    if (pricingNodes.has(node)) {
      collector.addPricing(node.tagName === "TABLE" ? tableToRows(node) : cardGridToRows(node));
      return; // don't descend — the pricing section owns this subtree
    }
    if (HEADING_TAGS.has(node.tagName)) {
      collector.startSection(node.text);
      return;
    }
    for (const child of node.childNodes) walk(child);
  };

  for (const child of body.childNodes) walk(child);
  collector.flush();

  return { extractVersion: EXTRACT_VERSION, sections: collector.toSections() };
}
