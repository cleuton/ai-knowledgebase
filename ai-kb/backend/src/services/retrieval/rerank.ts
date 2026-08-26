import { getEnv } from "../../config/env.js";
import { RERANK_TOP_N } from "../../config/constants.js";
import type { Chunk, ScoredChunk } from "../../models/types.js";

const VOYAGE_RERANK_URL = "https://api.voyageai.com/v1/rerank";
const RERANK_MODEL = "rerank-2";

interface VoyageRerankResponse {
  data: Array<{ index: number; relevance_score: number }>;
}

/** Cross-encoder reranking of the fused candidates — constitution Principle
 * II: only the reranked top N (default 8-10) may reach generation; the fused
 * RRF order itself is never used as the final selection. */
export async function rerank(
  questionText: string,
  candidates: ScoredChunk[],
  topN: number = RERANK_TOP_N,
): Promise<ScoredChunk[]> {
  if (candidates.length === 0) return [];

  const response = await fetch(VOYAGE_RERANK_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getEnv().voyageApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: questionText,
      documents: candidates.map((c) => c.chunk.text),
      model: RERANK_MODEL,
      top_k: Math.min(topN, candidates.length),
    }),
  });

  if (!response.ok) {
    throw new Error(`Voyage rerank request failed (${response.status}): ${await response.text()}`);
  }

  const body = (await response.json()) as VoyageRerankResponse;
  return body.data
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .map((d) => {
      const chunk = candidates[d.index]?.chunk as Chunk;
      return { chunk, score: d.relevance_score };
    });
}
