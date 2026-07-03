/**
 * Runs the classify-change prompt against the hand-labeled golden fixtures
 * and reports category accuracy + severity MAE. Fixtures are ground truth —
 * never edit them to make this pass (repo invariant 7).
 *
 * Usage: pnpm eval   (needs ANTHROPIC_API_KEY + a running Postgres for llm_calls)
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { closeDb } from "@rivalwatch/db";

import { classifyChange, classifyInputSchema, type ClassifyInput } from "../src/index.js";

interface Fixture {
  name: string;
  input: ClassifyInput;
  expected: { category: string; severity: number };
}

function loadFixtures(): Fixture[] {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Fixture[])
    .map((fixture) => ({ ...fixture, input: classifyInputSchema.parse(fixture.input) }));
}

async function main(): Promise<void> {
  const fixtures = loadFixtures();
  console.log(`Running classify-change eval on ${fixtures.length} golden fixtures…\n`);

  let categoryHits = 0;
  let severityAbsErrorSum = 0;
  let severityWithinOne = 0;
  const rows: string[] = [];

  for (const fixture of fixtures) {
    const result = await classifyChange(fixture.input);
    const categoryOk = result.category === fixture.expected.category;
    const severityError = Math.abs(result.severity - fixture.expected.severity);
    if (categoryOk) categoryHits++;
    severityAbsErrorSum += severityError;
    if (severityError <= 1) severityWithinOne++;
    rows.push(
      [
        categoryOk && severityError <= 1 ? "✓" : "✗",
        fixture.name.padEnd(38),
        `cat ${result.category}${categoryOk ? "" : ` (want ${fixture.expected.category})`}`.padEnd(30),
        `sev ${result.severity} (want ${fixture.expected.severity})`,
      ].join(" "),
    );
  }

  console.log(rows.join("\n"));
  const accuracy = (100 * categoryHits) / fixtures.length;
  const mae = severityAbsErrorSum / fixtures.length;
  console.log(`\nCategory accuracy: ${categoryHits}/${fixtures.length} (${accuracy.toFixed(1)}%)`);
  console.log(`Severity MAE: ${mae.toFixed(2)}  |  within ±1: ${severityWithinOne}/${fixtures.length}`);

  await closeDb();
  if (accuracy < 70) {
    console.error("\nFAIL: category accuracy below 70% threshold");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
