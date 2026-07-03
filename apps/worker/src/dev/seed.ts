/**
 * Seed a dev workspace pointing at the local fixture server, so the whole
 * pipeline can run offline:
 *
 *   pnpm --filter worker seed
 *   pnpm --filter worker fixture-server   (in another terminal)
 *   pnpm worker:trigger crawl --page-id=<printed id>
 */
import { loadEnv } from "@rivalwatch/config";
import { addCompetitor, addTrackedPage, closeDb, createWorkspace, getDb } from "@rivalwatch/db";

async function main(): Promise<void> {
  loadEnv();
  const db = getDb();

  const workspace = await createWorkspace(db, "Dev Workspace");
  const competitor = await addCompetitor(db, workspace.id, {
    name: "Acme (fixture)",
    domain: "localhost:8787",
  });
  const page = await addTrackedPage(db, workspace.id, competitor.id, {
    url: "http://localhost:8787/pricing",
    kind: "pricing",
  });

  console.log(`workspace:  ${workspace.id}`);
  console.log(`competitor: ${competitor.id}`);
  console.log(`page:       ${page.id}`);
  console.log(`\nNext: pnpm --filter worker fixture-server`);
  console.log(`Then: pnpm worker:trigger crawl --page-id=${page.id}`);

  await closeDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
