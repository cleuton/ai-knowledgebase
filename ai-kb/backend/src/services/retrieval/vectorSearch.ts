import pgvector from "pgvector";
import { query } from "../../db/client.js";
import { RETRIEVAL_CANDIDATES_PER_LEG } from "../../config/constants.js";
import type { Chunk } from "../../models/types.js";
import { toChunk, type ChunkRow } from "./chunkRow.js";

/** Cosine-similarity search over the HNSW index (research.md §7). Returns
 * candidates ordered nearest-first; `score` is `1 - cosine_distance`
 * (higher is more similar) — not comparable across retrieval legs, only used
 * for ranking within this leg ahead of RRF fusion (FR-012). */
export async function vectorSearch(
  queryEmbedding: number[],
  limit: number = RETRIEVAL_CANDIDATES_PER_LEG,
): Promise<Array<{ chunk: Chunk; score: number }>> {
  const result = await query<ChunkRow & { distance: number }>(
    `SELECT *, embedding <=> $1 AS distance
     FROM chunks
     ORDER BY embedding <=> $1
     LIMIT $2`,
    [pgvector.toSql(queryEmbedding), limit],
  );
  return result.rows.map((row) => ({ chunk: toChunk(row), score: 1 - row.distance }));
}
