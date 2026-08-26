// Tunable settings, defined once (constitution Principle V: "configurable
// constants in one place, never hardcoded magic numbers scattered through the
// code"). See research.md for the rationale behind each default.

/** Target chunk size, in tokens (approximated via characters/4 in chunker.ts). */
export const CHUNK_SIZE = 800;

/** Overlap between adjacent chunks, in tokens. */
export const CHUNK_OVERLAP = 120;

/** Images smaller than this (in either dimension) are treated as decorative
 * (icons/logos/rules) and are not sent for captioning. research.md §5. */
export const MIN_IMAGE_SIZE_PX = 100;

/** Minimum page-area fraction an image must occupy to be captioned, as a
 * second guard against small-but-not-tiny decorative art. research.md §5. */
export const MIN_IMAGE_AREA_FRACTION = 0.02;

/** Reciprocal Rank Fusion constant — the standard default from the RRF paper.
 * research.md §3. */
export const RRF_K = 60;

/** Number of candidates each retrieval leg (vector, lexical) contributes to fusion. */
export const RETRIEVAL_CANDIDATES_PER_LEG = 40;

/** Number of reranked chunks passed to generation. constitution Principle II. */
export const RERANK_TOP_N = 8;

/** Below this Voyage rerank relevance score (0-1 scale), the top chunk is not
 * considered confident enough to answer from. research.md §9. */
export const MIN_RERANK_SCORE = 0.3;

export const FIXED_NO_CONFIDENT_ANSWER_MESSAGE =
  "I couldn't find a confident answer in the knowledge base for that question.";
