import { readFileSync } from "node:fs";

export function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/pages/${name}`, import.meta.url), "utf8");
}
