import "dotenv/config";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPool, closePool } from "./client.js";

const migrationsDir = path.dirname(fileURLToPath(import.meta.url)) + "/migrations";

/** Runs every .sql file in migrations/ in filename order. Idempotent — each
 * migration uses IF NOT EXISTS / IF EXISTS guards rather than a tracking table,
 * which is sufficient for this MVP's single-migration schema. */
async function main(): Promise<void> {
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  const pool = getPool();
  for (const file of files) {
    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    console.log(`Applying migration: ${file}`);
    await pool.query(sql);
  }
  console.log(`Applied ${files.length} migration(s).`);
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
