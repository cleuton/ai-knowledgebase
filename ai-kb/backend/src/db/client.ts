import pg from "pg";
import { getEnv } from "../config/env.js";

const { Pool } = pg;

let pool: pg.Pool | undefined;

/** Lazily created singleton pool, shared by the API process and the ingestion worker. */
export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({ connectionString: getEnv().databaseUrl });
  }
  return pool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params as unknown[]);
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
