# Implementation Plan: Knowledge Base Search MVP

**Branch**: `001-kb-search-mvp` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-kb-search-mvp/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

A single-user Knowledge Base system that ingests PDF corpora (text and charts/images alike),
indexes every chunk for both vector and lexical retrieval in one PostgreSQL table, and answers
natural-language questions through a hybrid-search → RRF fusion → cross-encoder rerank →
citation-grounded generation pipeline. Chart and infographic images are captioned by a
vision-capable model and folded into the same text/embedding space as body content, so visual
data is queryable exactly like prose. The system explicitly refuses to answer when no chunk
clears a minimum relevance bar, and exposes async, non-blocking ingestion with per-document
status plus basic document list/delete management.

## Technical Context

**Language/Version**: TypeScript throughout — Node.js 20 LTS (backend), React 18 (frontend)

**Primary Dependencies**:
- Backend: Fastify (HTTP API), `pdfjs-dist` + `@napi-rs/canvas` (per-page text extraction and
  embedded image extraction via canvas rendering — `@napi-rs/canvas` over `node-canvas` to avoid
  a Cairo/Pango build-time dependency; research.md §1), `pg` (node-postgres), `pgvector` node client,
  `pg-boss` (Postgres-backed background job queue for async ingestion — avoids adding Redis
  as a second piece of infra, consistent with the constitution's single-Postgres mandate),
  `@anthropic-ai/sdk` (chart captioning + answer generation), Voyage AI REST client
  (embeddings + rerank), `zod` (request-body validation at the API boundary)
- Frontend: React + Vite, TanStack Query (API/data fetching + polling for ingestion status)

**Storage**: PostgreSQL 16+ with the `pgvector` extension; single `chunks` table carries
vector column, `tsvector` generated column, raw text, and metadata (per constitution Principle V)

**Testing**: Vitest for backend unit/contract/integration tests; React Testing Library +
Vitest for frontend component tests; Playwright for the end-to-end quickstart scenario

**Target Platform**: Linux server (containerized Node backend) + modern evergreen browsers

**Project Type**: Web application (frontend + backend)

**Performance Goals**: End-to-end query latency (question → rendered answer) under ~5s for a
corpus in the low-thousands-of-chunks range (SC-002); retrieval + rerank is the dominant,
budgeted cost, not generation

**Constraints**: Hybrid retrieval (vector + lexical, RRF-fused) is mandatory on every query —
vector-only ranking must never be the final signal; a cross-encoder rerank step must sit
between fusion and context assembly; every answer claim must carry a document+page citation;
absence of a confident chunk must produce an explicit "no confident answer" response, never a
guess (constitution Principles I, II, IV)

**Scale/Scope**: Single authenticated user/workspace; one corpus/collection; PDF files only;
target corpus size low-thousands-of-chunks for the stated performance goal

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Gates derived from `.specify/memory/constitution.md` v1.0.0:

| # | Gate (Principle) | Status | Notes |
|---|---|---|---|
| 1 | Hybrid retrieval is baseline, not phase 2 (I) | PASS | Every query plan runs vector + lexical search against the same `chunks` table and fuses via RRF before rerank; no vector-only path exists. |
| 2 | Rerank before cutoff — no naive top-K (II) | PASS | Fused ~30–50 candidates are always passed through Voyage Rerank before the top-N (configurable, default 8–10) reach generation. |
| 3 | Visual data is first-class, queryable text (III) | PASS | Every image ≥ min size threshold is captioned via Claude vision and spliced into the text stream as an atomic `[FIGURE: ...]` chunk; structured JSON kept as chunk metadata. |
| 4 | Grounded answers, honest absence (IV) | PASS | Generation prompt requires per-claim citations and a fixed "no confident answer" response path when no reranked chunk clears the relevance bar. |
| 5 | Structure-aware chunking, single source of truth (V) | PASS | Recursive/structure-aware chunker with configurable size/overlap constants; one `chunks` table (vector + tsvector + metadata) — no separate vector DB or search engine introduced. |
| 6 | MVP scope is a commitment (VI) | PASS | No agentic orchestration, multi-source routing, RBAC, multilingual expansion, or conversation memory appears anywhere in this plan's design. |
| 7 | Technology stack matches constitution | PASS | React+TS / Node+TS / Postgres+pgvector / Voyage AI / Anthropic API, as mandated. |
| 8 | Performance & operational standards | PASS | Async `pg-boss` ingestion (non-blocking UI), per-document status field, 5s latency budget carried into Technical Context, cascade delete removes chunks from both indexes. |

No violations — Complexity Tracking table below is left empty.

**Post-Phase 1 re-check** (after `research.md`, `data-model.md`, `contracts/`, `quickstart.md`
were produced): all 8 gates above still hold. Notably, `pg-boss` (Postgres-backed job queue,
research.md §2) and the HNSW/GIN indexes (research.md §7–8) add no infrastructure beyond the
single Postgres instance the constitution mandates, and the "no confident answer" gate
(research.md §9) is enforced deterministically in code rather than delegated to the LLM's
judgment, satisfying Principle IV in the strong sense the constitution intends. No new
violations were introduced by the detailed design; Complexity Tracking remains empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-kb-search-mvp/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── models/            # Document, Chunk, FigureCaption, QuestionAnswer types + DB access
│   ├── services/
│   │   ├── ingestion/      # PDF parsing, chart captioning, chunking, embedding, indexing
│   │   ├── retrieval/      # vector search, lexical search, RRF fusion, reranking
│   │   └── generation/     # citation-grounded answer generation, no-confident-answer gate
│   ├── jobs/               # pg-boss background worker for async ingestion
│   ├── api/                # HTTP route handlers (upload, documents, query)
│   └── db/                 # schema/migrations (chunks, documents tables + pgvector index)
└── tests/
    ├── contract/            # API contract tests (per contracts/*)
    ├── integration/         # ingestion pipeline, hybrid retrieval, generation flow
    └── unit/                # chunker, RRF fusion, prompt assembly, etc.

frontend/
├── src/
│   ├── components/         # chat UI, citation display, upload widget, document list/status
│   ├── pages/               # main app shell (chat + document management)
│   └── services/            # typed API client hooks (upload, documents, query)
└── tests/
    ├── unit/                 # component tests
    └── e2e/                  # Playwright quickstart scenario
```

**Structure Decision**: Web application structure (frontend + backend), matching the
constitution-mandated stack. `backend/` owns the ingestion pipeline, hybrid retrieval, and
generation services behind a small REST API; `frontend/` is a React chat UI plus document
management view that talks to that API. No additional services/repos are introduced.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _None — no constitution violations in this design._ | — | — |
