import { RRF_K } from "../../config/constants.js";
import type { Chunk, ScoredChunk } from "../../models/types.js";

/** Reciprocal Rank Fusion: `score(d) = Σ 1/(k + rank_i(d))` across each leg's
 * ranked list. Needs no score normalization between vector cosine similarity
 * and `ts_rank_cd` — exactly the mismatch RRF is designed to sidestep
 * (research.md §3, constitution Principle I). Chunks present in only one leg
 * still score, just lower than chunks both legs agree on. */
export function reciprocalRankFusion(
  ...rankedLists: Array<Array<{ chunk: Chunk }>>
): ScoredChunk[] {
  const scores = new Map<string, number>();
  const chunksById = new Map<string, Chunk>();

  for (const list of rankedLists) {
    list.forEach(({ chunk }, index) => {
      const rank = index + 1;
      chunksById.set(chunk.id, chunk);
      scores.set(chunk.id, (scores.get(chunk.id) ?? 0) + 1 / (RRF_K + rank));
    });
  }

  return [...scores.entries()]
    .map(([id, score]) => ({ chunk: chunksById.get(id)!, score }))
    .sort((a, b) => b.score - a.score);
}
