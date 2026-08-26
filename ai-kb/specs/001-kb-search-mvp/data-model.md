# Phase 1 Data Model: Knowledge Base Search MVP

Derived from spec.md's Key Entities section, refined with the storage decisions in
`research.md` (single `chunks` table serving both vector and lexical retrieval, per
constitution Principle V).

## Document

Represents one uploaded PDF and its ingestion lifecycle (spec FR-001–FR-005, FR-017).

| Field | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `filename` | text | Original uploaded filename; not unique — duplicate uploads are allowed (spec.md Assumptions) |
| `status` | enum: `queued`, `processing`, `indexed`, `failed` | See state transitions below |
| `status_reason` | text, nullable | Human-readable failure reason; set only when `status = failed` (FR-004, Edge Cases) |
| `page_count` | integer, nullable | Populated once parsing completes; null while `queued` |
| `uploaded_at` | timestamptz | |
| `indexed_at` | timestamptz, nullable | Set when status transitions to `indexed` |

**Validation rules**:
- `filename` must end in `.pdf`; non-PDF uploads are rejected at the API boundary before a
  `Document` row is created (FR-002).
- `status_reason` MUST be non-null when `status = failed`, and MUST be null otherwise.

**State transitions** (linear, no re-entry):

```
queued → processing → indexed
                    ↘ failed
```

- `queued → processing`: the background ingestion job picks up the document.
- `processing → indexed`: parsing, captioning, chunking, embedding, and indexing all
  succeeded for every extractable page.
- `processing → failed`: any stage throws an unrecoverable error (corrupt PDF, exhausted
  retries against the vision/embedding API, etc.); `status_reason` records which stage and why.
- Deleting a `Document` at any status removes the row and cascades to its `Chunk` rows
  (FK `ON DELETE CASCADE`); an in-flight `processing` job checks for the row's continued
  existence before each stage and aborts if it's gone (Edge Case: delete mid-processing).
- There is no `re-indexing` transition in this MVP (spec.md Assumptions) — refreshing content
  means delete + re-upload.

## Chunk

The unit of retrievable content — a chunk of body text or a single figure caption — and the
row that carries both the vector and lexical index for that content (spec FR-006–FR-011).

| Field | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `document_id` | UUID (FK → `documents.id`, `ON DELETE CASCADE`) | |
| `page` | integer | 1-indexed source page number (FR-003, FR-015 citations) |
| `chunk_index` | integer | Ordinal position within the document; stable ordering for debugging/display |
| `chunk_type` | enum: `text`, `figure` | Distinguishes body-text chunks from figure-caption chunks (FR-010) |
| `text` | text | The chunk's embedded/searchable content — body prose, or a figure's `summary` wrapped in `[FIGURE: ...]` (FR-007) |
| `embedding` | `vector(1024)` | Voyage AI embedding of `text`; dimension per the embedding model in use — confirm exact dimension against the live Voyage AI model card at implementation time (research.md §3–4) |
| `tsv` | `tsvector`, generated `GENERATED ALWAYS AS (to_tsvector('english', text)) STORED` | Lexical index source, always in sync with `text` (research.md §8) |
| `figure_metadata` | `jsonb`, nullable | Structured caption data (`chart_type`, `axes`, `approximate_values`, `trend`); non-null only when `chunk_type = figure` (FR-008) |
| `created_at` | timestamptz | |

**Validation rules**:
- `figure_metadata` MUST be non-null iff `chunk_type = figure`.
- `text` MUST NOT be empty (a page/image producing no content yields zero `Chunk` rows, not an
  empty one — Edge Cases).
- `embedding` MUST be present before a chunk is considered indexed; chunks are inserted only
  after embedding succeeds, so there is no "pending embedding" state to model.

**Indexes**:
- HNSW on `embedding` (`vector_cosine_ops`) — research.md §7.
- GIN on `tsv` — research.md §8.
- B-tree on `document_id` (supports cascade delete and per-document lookups).

**Relationships**: many `Chunk` rows per `Document` (`document_id` FK); a `Chunk` has no
relationship to other `Chunk` rows (no parent/child chunk hierarchy in this MVP).

## Question/Answer Exchange

A single question-answer round trip (spec FR-012–FR-016). **Not persisted** — this is a
request/response DTO shape, not a database table. The constitution and spec explicitly exclude
multi-turn conversation memory (Principle VI; spec Out of Scope), so there is no requirement to
store or list past exchanges; each question is handled statelessly.

| Field | Type | Notes |
|---|---|---|
| `question` | string | Raw user question text |
| `answer` | string | Generated answer text, or the fixed "no confident answer" message |
| `citations` | `Citation[]` | Empty when `confident = false` |
| `confident` | boolean | `false` when the top reranked chunk's relevance score is below `MIN_RERANK_SCORE` (research.md §9); gates whether generation runs at all |

## Citation

A reference from an answer claim to its source (spec FR-015). Embedded within a
Question/Answer Exchange response, not a standalone table.

| Field | Type | Notes |
|---|---|---|
| `document_id` | UUID | References the source `Document` |
| `document_filename` | string | Denormalized for display without a join round trip |
| `page` | integer | Source page number, copied from the cited `Chunk.page` |

**Validation rule**: every sentence/claim the generation step emits must map to at least one
`Citation`; the generation prompt contract (see `contracts/`) enforces this at the LLM-call
boundary, and a post-generation check rejects (and retries once) any answer containing
unattributed claims before falling back to the "no confident answer" response.
