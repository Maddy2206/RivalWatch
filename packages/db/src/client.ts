import { loadEnv } from "@rivalwatch/config";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "./schema.js";

export type Db = NodePgDatabase<typeof schema>;

let db: Db | undefined;
let pool: pg.Pool | undefined;

export function getDb(): Db {
  if (!db) {
    const env = loadEnv();
    pool = new pg.Pool({ connectionString: env.DATABASE_URL });
    db = drizzle(pool, { schema });
  }
  return db;
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
  db = undefined;
}
