# Knowledge Base Search MVP

Upload PDF documents (including ones with charts and infographics), then ask natural-language
questions and get grounded, cited answers — built on hybrid search (vector + lexical) and
reranking from day one. See [`specs/001-kb-search-mvp/`](specs/001-kb-search-mvp/) for the full
spec, plan, and task breakdown, and [`.specify/memory/constitution.md`](.specify/memory/constitution.md)
for the project's non-negotiable engineering principles.

[**Original user story:**](./USER_STORY.md)

## Prerequisites

- Node.js 20+
- PostgreSQL 16+ with the [`pgvector`](https://github.com/pgvector/pgvector) extension available
  (`CREATE EXTENSION vector` must succeed against your database)
- An [Anthropic API key](https://console.anthropic.com/) (chart captioning + answer generation)
- A [Voyage AI API key](https://www.voyageai.com/) (embeddings + reranking)

## Setup

```bash
# Backend
cd backend
npm install
cp .env.example .env   # fill in DATABASE_URL, ANTHROPIC_API_KEY, VOYAGE_API_KEY
npm run migrate        # applies backend/src/db/migrations/001_init.sql
npm run dev             # starts the API + ingestion worker on :3000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev              # starts the Vite dev server on :5173, proxying /api -> :3000
```

Open http://localhost:5173.

## Project layout

- `backend/src/services/ingestion/` — PDF parsing, chart captioning, chunking, embedding
- `backend/src/services/retrieval/` — vector search, lexical search, RRF fusion, reranking
- `backend/src/services/generation/` — confidence gate + citation-grounded answer generation
- `backend/src/jobs/` — pg-boss background worker for async ingestion
- `backend/src/api/` — Fastify HTTP API (`/documents`, `/query`)
- `frontend/src/components/` — upload widget, document list, chat panel, error boundary

## How it works

### Ingestion & chart captioning
Uploads are queued via a Postgres-backed `pg-boss` job and processed page by page. Each page's
text is extracted with `pdf.js`; embedded raster images are pulled from the page's operator list
and filtered so only real charts/figures get captioned — an image must be at least 100px in both
dimensions (`MIN_IMAGE_SIZE_PX`) and cover at least 2% of the page area (`MIN_IMAGE_AREA_FRACTION`),
so icons, logos, and rules are skipped. Qualifying images are sent to Claude (`claude-sonnet-5`) as
a vision input, forced via a tool call into a structured caption — chart type, axis labels,
approximate data values, trend, and a dense natural-language summary written to be a good
semantic-search target. That summary is spliced back into the page's text stream at the figure's
position as an atomic `[FIGURE: ...]` block, so chart content becomes searchable the same way as
body text.

### Chunking
A structure-aware/recursive splitter: paragraphs first, then sentences, with a hard character cut
only as a last resort for a single oversized unit with no natural break. Target chunk size is
~800 tokens (`CHUNK_SIZE`, approximated as characters/4), with 120 tokens of overlap
(`CHUNK_OVERLAP`) carried from the tail of one chunk into the next so context isn't lost at a
boundary. Figure captions are kept as their own atomic chunk — never merged with surrounding body
text — whenever they fit within the chunk size, so a chart's full caption stays retrievable as one
coherent unit.

### Embeddings
Voyage AI's `voyage-3` model (1024 dimensions), stored in a pgvector `VECTOR(1024)` column. Chunks
are embedded with `input_type: "document"` at index time and a user's question is embedded with
`input_type: "query"` at search time — Voyage tunes the model differently for each side of a
retrieval pair.

### Hybrid retrieval + fusion
Every query runs two independent searches over the same `chunks` table:
- **Vector search** — cosine similarity via pgvector's `<=>` operator over an HNSW index, top 40
  candidates (`RETRIEVAL_CANDIDATES_PER_LEG`).
- **Lexical search** — Postgres full-text search (`ts_rank_cd` over a GIN-indexed `tsvector`
  column, queried with `websearch_to_tsquery('english', ...)`), also top 40 candidates — this
  catches exact terms, codes, and identifiers that vector similarity alone can miss.

The two ranked lists are combined with **Reciprocal Rank Fusion (RRF)**:
`score(d) = Σ 1/(k + rank_i(d))` across both lists, with `k = 60` (`RRF_K`, the standard default
from the RRF paper). RRF needs no score normalization between the two legs' incomparable scales
(cosine similarity vs. `ts_rank_cd`) — that mismatch is exactly what RRF is designed to sidestep.

### Reranking
The fused candidate list is re-scored by Voyage's `rerank-2` cross-encoder against the actual
question text (not just embedding proximity). Only the top 8 reranked chunks (`RERANK_TOP_N`) are
eligible to reach generation — the raw RRF fusion order is never used as the final selection.

### Confidence gate
Before any generation call, a deterministic check runs: if the top reranked chunk's relevance
score is below 0.3 (`MIN_RERANK_SCORE`), the system immediately returns a fixed refusal —
*"I couldn't find a confident answer in the knowledge base for that question."* — without spending
an LLM call. This keeps "I don't know" a cheap, predictable code path rather than a judgment call
left to the model.

### Citation-grounded generation
If confidence passes, the top 8 reranked chunks are assembled as numbered sources and sent to
Claude (`claude-sonnet-5`), instructed to answer using only those sources, with every sentence
ending in a citation marker like `[1]` or `[1][3]`. The answer is checked after the fact — every
sentence must carry a citation — and if it doesn't, generation retries once before falling back to
the same fixed refusal rather than shipping a partially-ungrounded answer.

## Tests

```bash
cd backend && npm test            # Vitest — contract/integration/unit
cd frontend && npm test           # Vitest — component tests
cd frontend && npm run test:e2e   # Playwright — requires `npx playwright install chromium` once
```

`backend/tests/contract/documents.contract.test.ts` and `frontend/tests/e2e/smoke.spec.ts` are
intentionally infrastructure-free smoke tests (no live Postgres/API keys needed) that prove the
declared test stack is wired up correctly.

## Manual end-to-end validation

[`specs/001-kb-search-mvp/quickstart.md`](specs/001-kb-search-mvp/quickstart.md) walks through
four scenarios — upload & index, ask a text-grounded question, ask a chart-only question, and
delete a document — against a real Postgres instance and live Anthropic/Voyage credentials.
Run these after setup to confirm the whole pipeline works with real data, not just mocks.

## Manual tests with fake documents

[I have created 3 fake PDFs for you to index and search](./ai-kb/fake_documents/): a monthly sales
snapshot, an annual sales report, and a quarterly regional dashboard, each mixing body text with
charts/infographics. Index all three, then try questions that exercise different parts of the
pipeline above:

- **Plain-text retrieval** (hybrid search over body text alone):
  > "What was IronForge's total FY2025 revenue, and how much did it grow year-over-year?"
  > "How much did Bramwell & Sons' total revenue grow in August 2026 compared to July?"

- **Compound chart + text reasoning** (retrieves both a figure chunk and a text chunk, and asks
  the model to compute a cited value that isn't itself stated anywhere in the source):
  > "According to the report, D. Alvarez was the top-performing sales representative in Q3 2026. Using the leaderboard chart, calculate the dollar gap between D. Alvarez's sales and the second-place representative's sales. Then, based on the accompanying text, explain what specifically drove D. Alvarez's top ranking that quarter."

- **Out-of-corpus question** (exercises the confidence gate's refusal path — none of the three
  documents cover this period):
  > "What was the company's revenue in fiscal year 2019?"

![Using the web interface](./images/Screenshot%20from%202026-08-26%2012-39-09.png)

## Known MVP limitations

- Single-tenant, unauthenticated by design — deploy behind a trusted network or an external auth
  proxy (spec.md Assumptions).
- Figure placement within a page's text stream is approximated (images are appended after a
  page's text rather than spliced at their exact original position) — see the comment in
  `backend/src/services/ingestion/pdfImages.ts`.
- The uploaded PDF's bytes are held in-process between the upload request and the ingestion job
  rather than persisted to a blob store, so ingestion won't survive an API process restart
  between upload and the job actually starting (research.md §2 notes the queue itself is
  Postgres-backed and durable; the PDF bytes are not).
