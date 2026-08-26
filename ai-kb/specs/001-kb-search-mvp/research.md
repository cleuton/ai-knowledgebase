# Phase 0 Research: Knowledge Base Search MVP

No `NEEDS CLARIFICATION` markers remained in Technical Context after `spec.md` and the ratified
constitution were consulted — the constitution already fixed the stack and the retrieval
architecture. This document instead records the concrete technology and design decisions needed
to move from that stack mandate to an implementable design, plus the alternatives considered.

## 1. PDF text + image extraction

**Decision**: `pdfjs-dist` (Mozilla's PDF.js, used headlessly under Node). Walk each page with
`getTextContent()` for reading-order text, and enumerate `paintImageXObject` operators in the
page's operator list to locate embedded images; render each located image region via
`@napi-rs/canvas` to a PNG buffer for the captioning step.

**Rationale**: `pdfjs-dist` itself is pure-JS, and gives page-level text and image access in
the same pass — needed to preserve reading order and page number per FR-003. For the canvas
rendering step, `@napi-rs/canvas` (rather than the more commonly cited `node-canvas`/`canvas`
package) is used specifically because it ships prebuilt native binaries per platform;
`node-canvas` requires a local Cairo/Pango toolchain to compile from source via `node-gyp`,
which is exactly the kind of native-binary deployment complication this decision was already
trying to avoid (see "Alternatives considered" below) — `@napi-rs/canvas` provides the same
Canvas 2D API without that build-time dependency.

**Alternatives considered**:
- `pdf-parse` — text-only, no image access; rejected, fails AC02/FR-006.
- `pdf-poppler` / `mupdf-js` — faster and often more accurate on complex layouts, but require
  native binaries with no prebuilt-binary story as clean as `@napi-rs/canvas`'s, complicating
  deployment further; revisit post-MVP if extraction quality on real corpora proves
  insufficient.
- `node-canvas` (the `canvas` npm package) for the rendering step — the more commonly
  referenced choice, but requires Cairo/Pango installed on the build machine to compile via
  `node-gyp`; rejected in favor of `@napi-rs/canvas`'s prebuilt binaries once this became a
  concrete environment blocker.
- Render whole pages to images and let the vision model find charts itself — simpler
  extraction, but loses precise embedded-image boundaries and roughly doubles vision-API calls
  (every page vs. only pages with images); rejected for MVP cost/latency.

## 2. Async ingestion job queue

**Decision**: `pg-boss`, a job queue backed by Postgres itself.

**Rationale**: The constitution (Principle V) commits to Postgres as the single source of
truth and explicitly avoids extra infrastructure at MVP scale. `pg-boss` gives at-least-once
background job processing (FR-005) without introducing Redis or a separate broker.

**Alternatives considered**:
- BullMQ (Redis-backed) — more mature ecosystem and dashboarding, but adds a second stateful
  service; rejected for MVP infra-minimalism.
- In-process `setImmediate`/promise queue — no durability across process restarts, a failed
  ingestion would vanish rather than surface as "failed" (FR-004); rejected.

## 3. Hybrid retrieval fusion

**Decision**: Reciprocal Rank Fusion, `score(d) = Σ 1 / (k + rank_i(d))` with `k = 60` (the
standard RRF constant from the original paper), run over the top ~30–50 results from each of
the vector and lexical searches independently.

**Rationale**: RRF needs no score normalization between dissimilar scales (cosine similarity vs.
`ts_rank`), which is exactly the mismatch between pgvector and Postgres full-text search;
`k = 60` is the well-established default and avoids introducing a tunable the MVP has no data
to calibrate yet.

**Alternatives considered**: Weighted linear combination of normalized scores — requires
picking and tuning a weight with no data to justify one at MVP; rejected as premature tuning.

## 4. Reranking

**Decision**: Voyage AI Rerank API (`rerank-2` as default, `rerank-2-lite` as a
latency/cost-sensitive fallback if the 5s budget is at risk), called with the fused ~30–50
candidates and the raw user question, returning the configurable top N (default 8–10) for
generation.

**Rationale**: Constitution mandates Voyage AI for reranking; a hosted cross-encoder avoids
standing up and maintaining a reranking model in-process, keeping the MVP's operational surface
small.

**Alternatives considered**: Self-hosted cross-encoder (e.g., a BGE reranker) — removes a
per-query API cost and external dependency, but adds GPU/CPU inference infra to operate;
rejected for MVP, worth revisiting if Voyage rerank latency threatens the 5s target at scale.

## 5. Chart/image captioning

**Decision**: A vision-capable Claude model (Anthropic API) is called per qualifying image with
a structured-output prompt requesting: `chart_type`, `axes` (labels/units), `approximate_values`
(array of `{label, value}` best-effort readings), `trend` (free-text), and `summary` (a dense,
embedding-oriented natural-language paragraph). The `summary` is what gets wrapped in
`[FIGURE: ...]` and spliced into the document text stream; the full structured object is stored
as chunk metadata (`figure_metadata jsonb`).

**Rationale**: Directly implements constitution Principle III and spec FR-006–FR-008: one
model call, one JSON contract, keeping the caption's searchable text and its structured data in
sync by construction.

**Minimum size threshold**: images smaller than 100×100 px (or under ~2% of page area,
whichever is smaller) are treated as decorative (icons/logos/rules) and skipped, per Edge Case
in spec.md. This is a tunable internal constant, not user-facing configuration (per
spec.md Assumptions).

**Alternatives considered**: Native multimodal embeddings (embed the image directly, no
captioning) — would require a second, separate embedding space/index just for images, breaking
the "one hybrid search path" principle (constitution Principle III rationale) and complicating
FR-011/FR-012; explicitly rejected in the constitution itself.

## 6. Chunking strategy

**Decision**: Structure-aware/recursive chunking: split on heading boundaries first, then
paragraph boundaries, then sentence boundaries, only falling back to a hard character cut if a
single paragraph exceeds the max chunk size. Defaults: `CHUNK_SIZE = 800` tokens,
`CHUNK_OVERLAP = 120` tokens, defined as named constants in one config module (`chunking.ts`),
matching spec FR-009. `[FIGURE: ...]` captions are chunked as a single atomic unit whenever they
fit under `CHUNK_SIZE`; an oversized caption falls back to the same recursive splitter (FR-010,
accepted MVP limitation).

**Rationale**: Matches constitution Principle V and is the standard "best accuracy/cost
trade-off" strategy for mixed technical PDFs referenced in the constitution's rationale.

**Alternatives considered**: Fixed-size sliding window — simpler, but regularly splits
mid-sentence/mid-table, hurting both retrieval precision and generation quality; rejected per
constitution.

## 7. pgvector index

**Decision**: HNSW index (`vector_cosine_ops`) on the `chunks.embedding` column, with cosine
distance as the similarity metric (matching Voyage AI's recommended metric for its embeddings).

**Rationale**: HNSW gives better query-time recall/latency trade-off than IVFFlat at the
low-thousands-of-chunks scale in scope for this MVP, and — unlike IVFFlat — doesn't require a
representative data sample to train lists before it's usable, which matters for an MVP whose
corpus grows incrementally starting from zero.

**Alternatives considered**: IVFFlat — cheaper to build but needs periodic re-training as data
grows and is more sensitive to an empty/small initial corpus; rejected for MVP.

## 8. Lexical (full-text) search

**Decision**: A generated `tsvector` column (`GENERATED ALWAYS AS (to_tsvector('english',
text)) STORED`) with a GIN index; queries built with `websearch_to_tsquery('english', $query)`
and ranked with `ts_rank_cd`.

**Rationale**: `websearch_to_tsquery` tolerates natural-language questions (quotes, `-`
exclusions) without the caller hand-building tsquery syntax, and a generated+indexed column
keeps the lexical index always in sync with `text` at write time, satisfying FR-011's
"same table serves both paths" requirement structurally, not by convention.

## 9. "No confident answer" threshold

**Decision**: Gate on the reranker's relevance score for the top-ranked chunk: if it falls
below a configured threshold (`MIN_RERANK_SCORE`, initial default `0.3` on Voyage rerank's
0–1 relevance scale), the generation step is skipped entirely and a fixed "I couldn't find a
confident answer in the knowledge base for that question" response is returned — the LLM is
never invoked with a should-I-answer decision delegated to it, closing the loophole where a
model might rationalize an answer anyway (FR-016, constitution Principle IV).

**Rationale**: A deterministic, code-level gate is auditable and testable (SC-004 requires this
to hold "every time, in testing"); relying on prompt instructions alone for a hard business rule
is exactly the kind of guess constitution Principle IV forbids.

**Alternatives considered**: Let the LLM decide via prompt instruction only — kept as a
secondary safety net in the generation prompt, but not the primary mechanism, since it is not
reliably enforceable.

## 10. Ingestion status delivery to the UI

**Decision**: Simple polling — the frontend polls `GET /documents` every few seconds while any
document is `queued`/`processing`, backed by TanStack Query's `refetchInterval`.

**Rationale**: Meets FR-004/SC-001 (visible progress, non-blocking UI) with no new
infrastructure; a single-user MVP has no scale pressure that would justify WebSockets/SSE.

**Alternatives considered**: Server-Sent Events — lower latency status updates, but added
server-side connection-management complexity not justified until ingestion volume or
multi-client scenarios exist; candidate fast-follow.

## 11. Citation format

**Decision**: Citations are structured as `{document_id, document_filename, page}` attached to
each claim/sentence in the generation output (the model is prompted to emit inline markers like
`[1]` mapped to a citations array), rendered by the frontend as "Filename, p. N" — plain text,
no deep link into a rendered PDF viewer (per spec.md Assumptions).

**Rationale**: Matches FR-015/SC-005 without requiring an in-browser PDF viewer/highlighter,
which is out of scope for this MVP.
