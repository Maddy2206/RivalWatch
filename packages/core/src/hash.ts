import { createHash } from "node:crypto";

// zero-width space/joiners, word-joiner, BOM
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;
const NBSP = /\u00A0/g;

/**
 * Normalize text so cosmetic markup changes don't produce different hashes:
 * strip zero-width characters, unify nbsp/whitespace, collapse runs, trim.
 */
export function normalizeText(text: string): string {
  return text.replace(ZERO_WIDTH, "").replace(NBSP, " ").replace(/\s+/g, " ").trim();
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function hashNormalized(text: string): string {
  return sha256Hex(normalizeText(text));
}
