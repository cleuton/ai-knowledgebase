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

[I have created 3 fake PDFs for you to index and search](./ai-kb/fake_documents/). Just index them, and then create some queries. I even created a detailed query that demands image analysis: 

> "According to the report, D. Alvarez was the top-performing sales representative in Q3 2026. Using the leaderboard chart, calculate the dollar gap between D. Alvarez's sales and the second-place representative's sales. Then, based on the accompanying text, explain what specifically drove D. Alvarez's top ranking that quarter."

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
