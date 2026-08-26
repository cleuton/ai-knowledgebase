import { query } from "../../db/client.js";
import { RETRIEVAL_CANDIDATES_PER_LEG } from "../../config/constants.js";
import type { Chunk } from "../../models/types.js";
import { toChunk, type ChunkRow } from "./chunkRow.js";

/** Full-text search over the same `chunks` table's `tsv` column (research.md
 * §8). `websearch_to_tsquery` tolerates natural-language questions without
 * hand-built tsquery syntax; recovers exact terms/codes/identifiers that
 * vector similarity alone can miss (constitution Principle I, FR-012). */
export async function lexicalSearch(
  questionText: string,
  limit: number = RETRIEVAL_CANDIDATES_PER_LEG,
): Promise<Array<{ chunk: Chunk; score: number }>> {
  const result = await query<ChunkRow & { rank: number }>(
    `SELECT *, ts_rank_cd(tsv, websearch_to_tsquery('english', $1)) AS rank
     FROM chunks
     WHERE tsv @@ websearch_to_tsquery('english', $1)
     ORDER BY rank DESC
     LIMIT $2`,
    [questionText, limit],
  );
  return result.rows.map((row) => ({ chunk: toChunk(row), score: row.rank }));
}
