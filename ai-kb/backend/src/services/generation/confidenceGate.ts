import { MIN_RERANK_SCORE } from "../../config/constants.js";
import type { ScoredChunk } from "../../models/types.js";

/** Deterministic, code-level gate: if the top reranked chunk's relevance
 * score doesn't clear MIN_RERANK_SCORE, generation is skipped entirely
 * rather than delegating the should-I-answer decision to the LLM's
 * judgment (research.md §9, constitution Principle IV, FR-016). */
export function isConfident(rerankedChunks: ScoredChunk[]): boolean {
  const top = rerankedChunks[0];
  return top !== undefined && top.score >= MIN_RERANK_SCORE;
}
