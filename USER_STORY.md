# Knowledge Base Search System — MVP User Story

## Summary

Build a Knowledge Base system that ingests a corpus of PDF documents (including documents with charts, graphs, and images), indexes them for both lexical and vector search, and answers natural-language questions by retrieving the most relevant passages and generating grounded answers. The system must apply retrieval best practices from day one (hybrid search + reranking) rather than relying on a naive top-K vector cutoff, since a naive cutoff is the documented root cause of missed-answer failures in comparable RAG systems.

---

## Background

Naive RAG pipelines that only do vector similarity search and take a fixed top-K of chunks suffer from a well-documented failure mode: the correct document exists in the corpus, is retrieved as a candidate, but gets pushed out of the final context by a fixed cutoff or by competition from other semantically-close documents. This is compounded when documents contain charts and infographics, since standard text extraction ignores visual data entirely, making numeric information in graphs unsearchable and unanswerable.

This MVP must avoid repeating that failure mode. It should ship with hybrid retrieval (lexical + vector) and reranking as baseline architecture — not as a "phase 2" improvement — because the evidence shows these two techniques are the highest-impact, most proven levers for retrieval accuracy, and retrofitting them later is more expensive than building on top of them from the start.

At the same time, this is an MVP: scope is deliberately limited to a working, fast, accurate single-pass retrieval pipeline. Agentic orchestration, query routing by intent, intelligent source selection, and multi-hop retrieval are explicitly out of scope for this story.

---

## Goal

A user can upload a set of PDF documents (including ones containing charts/graphs) and ask natural-language questions in a chat-style UI, receiving accurate, cited answers grounded in the corpus — including answers derived from data inside charts and images — within a few seconds.

---

## Scope (MVP)

**In scope:**
- PDF ingestion pipeline (text + images/charts) → structured intermediate document → chunking → embedding → indexing.
- Hybrid search (lexical BM25-style + vector similarity) with fusion.
- Reranking of candidates before final context assembly.
- Chart/graph captioning pipeline so numeric/visual data becomes searchable text.
- A simple chat UI for asking questions and viewing answers with source citations.
- Basic document management (upload, list, delete, re-index).

**Out of scope (explicitly deferred):**
- Agentic/multi-step orchestration (query planning, tool-calling loops).
- Intelligent multi-source routing (single corpus/collection for MVP).
- Metadata-based pre-filtering UI (schema is captured, but filtering UI is a fast-follow).
- Access control / RBAC beyond a single authenticated user base.
- Multilingual query expansion/translation.
- Conversation memory / multi-turn context compaction.
- Non-PDF file types.

---

## User Story

**Title:** Search and get grounded answers from a PDF knowledge base, including data inside charts and images.

**Narrative:**
A knowledge worker uploads a set of PDF documents to the system. Once indexed, they ask questions in plain language — including questions whose answer lives inside a chart, infographic, or table image — and receive a direct answer with citations pointing to the source document and page. The answer must reflect the actual most-relevant content, not just whatever happened to survive a fixed retrieval cutoff.

**Value:**
Removes manual document search. Makes visual data (charts, infographics) queryable the same way as body text. Reduces the risk of the system confidently answering from incomplete context.

---

## Acceptance Criteria

**AC01 — Document ingestion**
- User can upload one or more PDF files through the UI.
- System extracts text and images per page, preserving reading order and page number.
- System reports ingestion status per document (queued, processing, indexed, failed) so the UI isn't a black box.

**AC02 — Chart/image understanding**
- Every extracted image above a minimum size threshold is sent to a vision-capable model to generate a structured caption: chart type, axes, approximate values, trend, and a dense natural-language summary optimized for embedding.
- The generated caption is inserted back into the document text stream at the original image position, wrapped in a clear marker (e.g. `[FIGURE: ...]`), so it flows into chunking like any other text.
- The structured JSON (raw values, chart type, etc.) is stored as chunk metadata for later filtering/display, separately from the embedded text.
- A question whose answer is only present inside a chart (e.g. "what was X in year Y according to the chart") must be answerable from the indexed caption text.

**AC03 — Chunking**
- Documents are split using a structure-aware/recursive strategy by default (respecting paragraphs and headings before falling back to raw size cuts).
- Each image caption is treated as an atomic chunk when reasonably sized (not split mid-caption); oversized captions may be split but that's a known, accepted MVP limitation.
- Chunk size and overlap are configurable constants, not hardcoded magic numbers scattered through the code.

**AC04 — Indexing**
- Each chunk is embedded via the embedding API and stored in Postgres/pgvector with: vector, raw text, source document id, page number, chunk type (text/figure), and any figure metadata.
- A lexical (full-text) index is maintained alongside the vector index on the same chunk table, so both retrieval paths query the same source of truth.

**AC05 — Hybrid retrieval**
- A query triggers both a vector similarity search and a lexical (full-text) search against the corpus.
- Results from both paths are fused into a single ranked candidate list (e.g. via reciprocal rank fusion) before reranking — vector search alone is not the final ranking signal, per the documented risk of missing exact terms, codes, and identifiers.

**AC06 — Reranking**
- The fused candidate list (on the order of 30–50 candidates) is passed to a cross-encoder reranking model along with the original query.
- Only the top N (configurable, default ~8–10) reranked chunks are passed to the generation step — not a fixed raw top-K from the initial vector search.

**AC07 — Answer generation**
- The reranked top chunks are assembled into a context window and sent to the LLM with the user's question.
- The generated answer includes citations (source document + page) for every claim it makes.
- If no chunk clears a minimum relevance bar, the system explicitly says it couldn't find a confident answer instead of guessing — absence of retrieved evidence must never be presented as if it were a confirmed answer.

**AC08 — Performance**
- End-to-end answer latency (query → rendered answer) should target under ~5 seconds for a corpus in the low-thousands-of-chunks range, with retrieval + rerank being the dominant cost the team should budget for.
- Ingestion of a typical PDF (text + a handful of images) should complete in the background without blocking the UI; the user can keep working while indexing runs.

**AC09 — Basic document management**
- User can view a list of indexed documents with status and delete a document, which removes its chunks from both indexes.

---

## Platform Proposal

### Stack
| Layer | Technology |
|---|---|
| Frontend | React + TypeScript |
| Backend | Node.js + TypeScript |
| Database | PostgreSQL + `pgvector` extension |
| Lexical search | Postgres full-text search (`tsvector`/`tsquery`) on the same table — no separate search engine for MVP |
| Embeddings | Voyage AI API (`voyage-3` or current equivalent) |
| Reranking | Voyage AI Rerank API (`rerank-2` / `rerank-2-lite`) |
| Chart/image captioning | Anthropic API (vision-capable Claude model) |
| Answer generation | Anthropic API (Claude model) |
| PDF parsing | Node PDF parsing library (text + embedded image extraction) |

### Why Postgres + pgvector for MVP
A single database gives one source of truth for chunks, vectors, lexical index, and metadata, with transactional consistency and no cross-system sync. This is the right trade-off for an MVP: it avoids standing up a separate vector DB and a separate search engine, while still supporting both retrieval paths needed for AC05. Migrating to a dedicated vector/search engine later is a valid fast-follow if scale demands it, but is not justified for the MVP's corpus size.

### High-level pipeline

**Ingestion (async, per document):**
1. Parse PDF → ordered list of blocks (`text` | `image`, with page number).
2. For each `image` block: call Claude vision API → structured JSON caption + dense embedding-ready summary text.
3. Assemble intermediate document: image blocks replaced in-place by `[FIGURE: <summary>]`, JSON kept as pending metadata.
4. Chunk the intermediate document (structure-aware/recursive; image captions kept atomic where feasible).
5. Embed each chunk via Voyage AI.
6. Insert into Postgres: `chunks` table with `text`, `embedding vector(N)`, `tsv` (generated full-text column), `document_id`, `page`, `chunk_type`, `figure_metadata jsonb`.

**Query (sync, per user question):**
1. Embed the query (Voyage AI).
2. Run vector similarity search (pgvector, e.g. cosine/HNSW index) → top ~30–50 candidates.
3. Run lexical full-text search (Postgres `tsquery`) → top ~30–50 candidates.
4. Fuse both ranked lists (Reciprocal Rank Fusion).
5. Rerank fused candidates via Voyage Rerank API → top N.
6. Assemble context from top N chunks, call Anthropic API for the final answer with citation instructions.
7. Return answer + citations to the frontend.

### Data model (indicative)

```
documents
  id, filename, status, uploaded_at, page_count

chunks
  id, document_id, page, chunk_type ('text' | 'figure'),
  text, embedding vector(N), tsv tsvector,
  figure_metadata jsonb NULL,
  created_at
```

### APIs used
- **Anthropic API** — vision model for chart/image captioning (AC02); generation model for final answer synthesis with citations (AC07).
- **Voyage AI Embeddings API** — chunk and query embedding.
- **Voyage AI Rerank API** — cross-encoder reranking of fused candidates (AC06).
- Internal REST/HTTP API between React frontend and Node backend for upload, status, query, and document management.

---

## Techniques Applied (and why, per the source recommendations)

- **Hybrid search over vector-only search** — pure dense retrieval is no longer considered sufficient on its own; exact terms, codes, and identifiers are recovered far better by lexical search, and combining both is treated as baseline, not optional, in mature RAG architectures.
- **Reranking before final cutoff, not a raw top-K vector cutoff** — this is the single highest-leverage, most consistently evidenced improvement over naive retrieval, and directly prevents the "correct document retrieved but discarded before generation" failure mode.
- **Structure-aware/recursive chunking as default** — best end-to-end accuracy/cost trade-off among chunking strategies for mixed, moderately-structured technical PDFs; semantic and agentic chunking are more expensive with inconsistent gains and are not justified for MVP.
- **Image captioning → text embedding (not native multimodal embeddings or page-as-image)** — chosen for MVP because it keeps every chunk (text or figure-derived) in the same embedding space, enabling one unified hybrid search path instead of a separate multimodal index; simplest to implement and reason about, at the acceptable cost of some fine numeric detail possibly being lost in the caption.
- **Absence-of-evidence handling in the generation prompt** — explicit instruction that a lack of retrieved context is never phrased as proof the information doesn't exist in the corpus.

---

## Explicitly Deferred (post-MVP backlog candidates)
- Metadata pre-filtering (date/type/topic) before vector search.
- Multi-source/collection-aware retrieval and intelligent source selection.
- Query expansion/translation for multilingual corpora.
- Contextual retrieval (LLM-generated per-chunk context summaries) as an accuracy upgrade once baseline hybrid+rerank is measured.
- Agentic orchestration / multi-hop retrieval.
- Formal retrieval benchmark suite (30–50 labeled questions with recall@k/MRR/NDCG tracking) — valuable, but the MVP goal is a working baseline to benchmark against, not the benchmark itself.
