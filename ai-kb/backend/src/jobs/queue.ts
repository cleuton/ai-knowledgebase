import PgBoss from "pg-boss";
import { getEnv } from "../config/env.js";

export const INGESTION_QUEUE = "document-ingestion";

let boss: PgBoss | undefined;

/** Postgres-backed job queue (research.md §2) — deliberately reuses the same
 * database as the rest of the app rather than adding Redis/BullMQ, per the
 * constitution's single-Postgres mandate (Principle V). */
export async function getQueue(): Promise<PgBoss> {
  if (!boss) {
    boss = new PgBoss({ connectionString: getEnv().databaseUrl });
    boss.on("error", (err) => console.error("pg-boss error:", err));
    await boss.start();
    await boss.createQueue(INGESTION_QUEUE);
  }
  return boss;
}

export async function stopQueue(): Promise<void> {
  if (boss) {
    await boss.stop();
    boss = undefined;
  }
}

export interface IngestionJobData {
  documentId: string;
}
