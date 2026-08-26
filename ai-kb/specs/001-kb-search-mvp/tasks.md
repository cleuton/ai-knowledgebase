---

description: "Task list template for feature implementation"
---

# Tasks: Knowledge Base Search MVP

**Input**: Design documents from `/specs/001-kb-search-mvp/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.openapi.yaml, quickstart.md

**Tests**: Not explicitly requested in spec.md — no per-story test tasks are generated below.
`quickstart.md` documents the manual/automated validation scenarios to run once each story is
built; T047 executes them. T049 (Polish) configures the test runners plan.md commits to and
proves them wired up with one smoke test each, without a full TDD campaign.

**Organization**: Tasks are grouped by user story (spec.md priorities P1–P4) to enable
independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Exact file paths are included in every task description

## Path Conventions

Web app structure per `plan.md`: `backend/src/`, `backend/tests/`, `frontend/src/`, `frontend/tests/`.

---

## Constitution Check

*Re-affirms `.specify/memory/constitution.md` v1.0.0 at the task-breakdown level, per the
Governance clause's requirement that `/speckit-tasks` runs include this confirmation.*

| Principle | Satisfied By |
|---|---|
| I. Hybrid retrieval is baseline | T027 (vector search) + T028 (lexical search) + T029 (RRF fusion) — both paths always run and are fused before rerank |
| II. Rerank before cutoff | T030 (Voyage rerank on the fused candidates; only the reranked top N reaches generation) |
| III. Visual data is first-class text | T036–T040 (minimum-size filtering, vision captioning, splicing into the text stream, figure metadata persistence) |
| IV. Grounded answers, honest absence | T031 (deterministic confidence gate) + T032 (per-claim citation enforcement) |
| V. Structure-aware chunking, single source of truth | T017 (recursive chunker) + T006/T007/T019 (one `chunks` table carries vector, tsvector, and metadata — no separate index infrastructure) |
| VI. MVP scope is a commitment | No task in Phases 1–7 implements agentic orchestration, multi-source routing, RBAC, multilingual expansion, or conversation memory |

No violations — no Complexity Tracking entries required at the task level.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Create `backend/` and `frontend/` top-level project directories per plan.md Project Structure
- [X] T002 Initialize backend Node+TypeScript project (Fastify, `tsconfig.json`, `package.json`) in `backend/`
- [X] T003 [P] Initialize frontend Vite+React+TypeScript project in `frontend/`
- [X] T004 [P] Configure ESLint + Prettier for `backend/` and `frontend/`
- [X] T005 Configure environment loading for `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `DATABASE_URL` in `backend/src/config/env.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T006 Create Postgres migration for `documents` and `chunks` tables per data-model.md in `backend/src/db/migrations/001_init.sql`
- [X] T007 Extend migration with `CREATE EXTENSION vector`, HNSW index (`vector_cosine_ops`) on `chunks.embedding`, and GIN index on `chunks.tsv` in `backend/src/db/migrations/001_init.sql` (same file as T006)
- [X] T008 [P] Implement Postgres connection pool + query helpers in `backend/src/db/client.ts`
- [X] T009 [P] Define shared TypeScript types (`Document`, `Chunk`, `Citation`, `QuestionAnswerExchange`) in `backend/src/models/types.ts` per data-model.md
- [X] T010 [P] Define tunable constants (`CHUNK_SIZE`, `CHUNK_OVERLAP`, `MIN_IMAGE_SIZE_PX`, `MIN_RERANK_SCORE`, RRF `k=60`) in `backend/src/config/constants.ts` per research.md
- [X] T011 [P] Scaffold Fastify app with error-handling middleware in `backend/src/api/server.ts`
- [X] T012 [P] Initialize `pg-boss` job queue against the same Postgres instance in `backend/src/jobs/queue.ts`
- [X] T013 [P] Scaffold frontend app shell and routing in `frontend/src/pages/App.tsx`

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 - Upload and Index a PDF Corpus (Priority: P1) 🎯 MVP

**Goal**: A knowledge worker uploads PDFs and watches each one progress from queued →
processing → indexed/failed, without the UI ever blocking. Text content is extracted, chunked,
embedded, and indexed (image/chart captioning is added in User Story 3).

**Independent Test**: Upload one or more PDFs through the UI; confirm status visibly progresses
to indexed, the UI stays responsive throughout, and a corrupted file is reported as failed
(quickstart.md Scenario 1).

### Implementation for User Story 1

- [X] T014 [P] [US1] Implement per-page PDF text extraction (reading order preserved) using `pdfjs-dist` in `backend/src/services/ingestion/pdfText.ts`
- [X] T015 [P] [US1] Implement per-page embedded-image extraction (page number + bounding box) using `pdfjs-dist` + `@napi-rs/canvas` in `backend/src/services/ingestion/pdfImages.ts`
- [X] T016 [P] [US1] Implement `Document` repository (create, list, get, updateStatus) in `backend/src/models/documentRepository.ts`
- [X] T017 [P] [US1] Implement structure-aware/recursive chunker (heading → paragraph → sentence → hard cut, using `CHUNK_SIZE`/`CHUNK_OVERLAP`) in `backend/src/services/ingestion/chunker.ts`
- [X] T018 [P] [US1] Implement Voyage AI embeddings client wrapper in `backend/src/services/ingestion/embeddings.ts`
- [X] T019 [US1] Implement chunk indexer (insert chunk rows with `text`, `embedding`, generated `tsv`) in `backend/src/services/ingestion/indexer.ts` (depends on T016, T017, T018)
- [X] T020 [US1] Implement the ingestion pipeline orchestrator as a `pg-boss` job handler — parse → chunk (text only for now) → embed → index → update document status — in `backend/src/jobs/ingestionJob.ts` (depends on T014, T017, T019)
- [X] T021 [US1] Implement `POST /documents` (multipart upload, reject non-PDF with 400, create `queued` Document rows, enqueue ingestion job) in `backend/src/api/routes/documents.ts` (depends on T016, T020)
- [X] T022 [US1] Implement `GET /documents` (list with status) in `backend/src/api/routes/documents.ts` (same file as T021 — implement after T021)
- [X] T023 [P] [US1] Implement frontend upload widget (multi-file PDF picker, client-side PDF-type check, calls `POST /documents`) in `frontend/src/components/UploadWidget.tsx`
- [X] T024 [P] [US1] Implement frontend document list component polling `GET /documents` (TanStack Query `refetchInterval`) in `frontend/src/components/DocumentList.tsx`
- [X] T025 [US1] Wire upload widget and document list into the app shell in `frontend/src/pages/App.tsx` (depends on T023, T024)
- [X] T026 [US1] Implement pipeline failure handling — catch stage errors, set `status = failed` with `status_reason` — in `backend/src/jobs/ingestionJob.ts` (same file as T020 — implement after T020)

**Checkpoint**: User Story 1 fully functional and independently testable — text-only corpus
upload, ingestion, and status tracking works end to end.

---

## Phase 4: User Story 2 - Ask a Question and Get a Grounded, Cited Answer (Priority: P2)

**Goal**: A knowledge worker asks a question and receives an accurate, cited answer built from
hybrid search (vector + lexical, RRF-fused) and reranking — never a naive vector-only cutoff —
or an explicit "no confident answer" response when nothing clears the relevance bar.

**Independent Test**: Against a corpus already indexed by User Story 1, ask a question whose
answer is in a document's body text; confirm the returned answer is correct, cited, and that an
unanswerable question gets an honest refusal (quickstart.md Scenario 2).

### Implementation for User Story 2

- [X] T027 [P] [US2] Implement vector similarity search (pgvector cosine, top ~30–50) in `backend/src/services/retrieval/vectorSearch.ts`
- [X] T028 [P] [US2] Implement lexical search (`websearch_to_tsquery` + `ts_rank_cd`, top ~30–50) in `backend/src/services/retrieval/lexicalSearch.ts`
- [X] T029 [US2] Implement Reciprocal Rank Fusion (`k=60`) combining the two ranked lists in `backend/src/services/retrieval/fusion.ts` (depends on T027, T028)
- [X] T030 [US2] Implement Voyage AI rerank client wrapper, reranking fused candidates to top N (default 8–10) in `backend/src/services/retrieval/rerank.ts` (depends on T029)
- [X] T031 [US2] Implement the deterministic no-confident-answer gate (`MIN_RERANK_SCORE` check on the top reranked chunk) in `backend/src/services/generation/confidenceGate.ts` (depends on T030, T010)
- [X] T032 [US2] Implement citation-grounded answer generation via the Anthropic API (per-claim citation mapping, rejects/retries unattributed claims) in `backend/src/services/generation/answerGenerator.ts` (depends on T031)
- [X] T033 [US2] Implement `POST /query` wiring retrieval → fusion → rerank → confidence gate → generation in `backend/src/api/routes/query.ts` (depends on T032)
- [X] T034 [P] [US2] Implement frontend chat panel (question input, cited-answer display, no-confident-answer state) in `frontend/src/components/ChatPanel.tsx`
- [X] T035 [US2] Wire the chat panel into the app shell in `frontend/src/pages/App.tsx` (same file as T025 — implement after T025)

**Checkpoint**: User Stories 1 AND 2 both work independently — a text-only corpus can be
uploaded and queried with grounded, cited answers.

---

## Phase 5: User Story 3 - Answer Questions From Chart and Infographic Data (Priority: P3)

**Goal**: Extend the ingestion pipeline so qualifying images are captioned by a vision model and
spliced into the chunk stream as `[FIGURE: ...]` text, making chart/infographic data queryable
through the same hybrid search + rerank + generation pipeline built in User Story 2 — no changes
to the query path are needed.

**Independent Test**: Upload a PDF whose chart data is not restated in surrounding text; ask a
question answerable only from that chart; confirm a correct, cited answer (quickstart.md
Scenario 3).

### Implementation for User Story 3

- [X] T036 [US3] Add minimum-size filtering (skip decorative images below `MIN_IMAGE_SIZE_PX`) in `backend/src/services/ingestion/pdfImages.ts` (same file as T015 — implement after T015)
- [X] T037 [P] [US3] Implement the Anthropic vision captioning client producing structured JSON (`chart_type`, `axes`, `approximate_values`, `trend`, `summary`) in `backend/src/services/ingestion/imageCaptioning.ts`
- [X] T038 [US3] Implement the document assembler that splices each `[FIGURE: summary]` caption into the per-page text stream at the image's original position and keeps captions as atomic figure chunks in `backend/src/services/ingestion/pdfAssembler.ts` (depends on T036, T037, T017)
- [X] T039 [US3] Update the ingestion orchestrator to run image captioning + assembly before chunking, replacing User Story 1's text-only path in `backend/src/jobs/ingestionJob.ts` (same file as T020/T026 — implement after T026)
- [X] T040 [US3] Update the chunk indexer to persist `figure_metadata jsonb` for figure-type chunks in `backend/src/services/ingestion/indexer.ts` (same file as T019 — implement after T019)

**Checkpoint**: All three of User Stories 1–3 work independently — chart-only questions are now
answerable, reusing User Story 2's query pipeline unmodified.

---

## Phase 6: User Story 4 - Manage the Document Corpus (Priority: P4)

**Goal**: A knowledge worker views the document list (built in User Story 1) and deletes a
document, with all of its chunks removed from both the vector and lexical indexes.

**Independent Test**: Delete an indexed document and confirm a question previously answerable
from it no longer surfaces that content (quickstart.md Scenario 4).

### Implementation for User Story 4

- [X] T041 [US4] Implement `DELETE /documents/{id}` (cascading delete of chunks via FK, 404 if not found) in `backend/src/api/routes/documents.ts` (same file as T021/T022 — implement after T022)
- [X] T042 [US4] Add in-flight-ingestion abort check (job verifies the document row still exists before each pipeline stage) in `backend/src/jobs/ingestionJob.ts` (same file as T020/T026/T039 — implement after T039)
- [X] T043 [US4] Implement frontend delete action (button + confirmation + list refresh) in `frontend/src/components/DocumentList.tsx` (same file as T024 — implement after T024)

**Checkpoint**: All four user stories independently functional — full upload, query,
chart-QA, and corpus management flows work end to end.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T044 [P] Add structured logging across ingestion and query pipelines, including per-stage latency (retrieval, rerank, generation) to verify SC-002's ~5s budget, in `backend/src/lib/logger.ts`
- [X] T045 [P] Add request-body validation (Zod schemas) for all API routes in `backend/src/api/schemas.ts`
- [X] T046 Add an error boundary and failure toasts for API errors in `frontend/src/components/ErrorBoundary.tsx`
- [ ] T047 Execute all four quickstart.md validation scenarios end-to-end against a real Postgres instance and live Anthropic/Voyage APIs
- [X] T048 [P] Write repository `README.md` documenting local setup (env vars, migrations, dev commands)
- [X] T049 [P] Configure the Vitest (backend) and Playwright (frontend) test runners declared in plan.md's Technical Context, and write one smoke test per suite (e.g., a `POST /documents` rejects-non-PDF contract test, and a Playwright test that loads the app shell) so the declared test stack is proven wired up

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational only
- **User Story 2 (Phase 4)**: Depends on Foundational; needs an indexed corpus to test against, which User Story 1 produces — build/test US1 first even though the code has no hard import dependency on it
- **User Story 3 (Phase 5)**: Depends on Foundational; modifies files created in US1 (`pdfImages.ts`, `ingestionJob.ts`, `indexer.ts`) — implement after US1
- **User Story 4 (Phase 6)**: Depends on Foundational; modifies files created in US1/US3 (`documents.ts`, `ingestionJob.ts`, `DocumentList.tsx`) — implement after US1 (and after US3 for the ingestionJob.ts touch point)
- **Polish (Phase 7)**: Depends on all four user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: No dependency on other stories — the true MVP slice
- **User Story 2 (P2)**: Independently testable given any indexed corpus; in practice exercised against User Story 1's output
- **User Story 3 (P3)**: Extends User Story 1's ingestion pipeline; independently testable once US1 exists, and requires no changes to User Story 2's query path
- **User Story 4 (P4)**: Extends User Story 1's document list and touches the ingestion job for abort-safety; independently testable once US1 exists

### Within Each User Story

- Models/repositories before services
- Services before pipeline orchestration / API routes
- Backend endpoint before the frontend component that calls it
- Story implementation complete and checkpoint-validated before starting the next priority

### Parallel Opportunities

- All Setup tasks marked [P] (T003, T004) can run in parallel with T002
- All Foundational tasks marked [P] (T008–T013) can run in parallel once T006/T007 land
- Within User Story 1: T014, T015, T016, T017, T018 can all run in parallel (5 independent files)
- Within User Story 2: T027, T028 can run in parallel; T034 (frontend) can run in parallel with any backend task in the same phase
- Within User Story 3: T037 can run in parallel with T036
- Polish tasks marked [P] (T044, T045, T048, T049) can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch independent User Story 1 file-creation tasks together:
Task: "Implement per-page PDF text extraction in backend/src/services/ingestion/pdfText.ts"
Task: "Implement per-page embedded-image extraction in backend/src/services/ingestion/pdfImages.ts"
Task: "Implement Document repository in backend/src/models/documentRepository.ts"
Task: "Implement structure-aware/recursive chunker in backend/src/services/ingestion/chunker.ts"
Task: "Implement Voyage AI embeddings client wrapper in backend/src/services/ingestion/embeddings.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (blocks everything else)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: run quickstart.md Scenario 1 independently
5. Demo: PDFs upload and index visibly, even though no questions can be asked yet

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. Add User Story 1 → validate (Scenario 1) → demo (ingestion works)
3. Add User Story 2 → validate (Scenario 2) → demo (grounded Q&A over body text — the core MVP value)
4. Add User Story 3 → validate (Scenario 3) → demo (chart/infographic questions now answerable)
5. Add User Story 4 → validate (Scenario 4) → demo (full corpus management)
6. Polish phase → production-readiness pass

### Parallel Team Strategy

With multiple developers, after Foundational is done:
- Developer A: User Story 1 (ingestion + status)
- Developer B: User Story 2's retrieval/generation services (T027–T033) — can be built and unit-tested against stubbed chunk data while User Story 1 is still in progress, then integrated once real indexed data exists
- Developer C: begins User Story 3's `imageCaptioning.ts` (T037, no dependency on US1's files) early, integrating once T015/T036 land

---

## Notes

- [P] tasks = different files, no same-phase dependency on an incomplete task
- [Story] label maps every user-story-phase task to US1/US2/US3/US4 for traceability
- No per-story test tasks were generated — spec.md did not request TDD/tests; `quickstart.md`
  is the primary validation mechanism (T047), with T049 proving the declared test stack works
- Tasks that share a file with an earlier task in the same or a later story explicitly note
  "same file as T0XX — implement after T0XX" instead of being marked [P]
- Commit after each task or logical group; stop at any checkpoint to validate a story independently
