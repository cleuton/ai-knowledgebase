# Quickstart: Knowledge Base Search MVP

End-to-end validation scenarios proving the feature works as specified in `spec.md`. Each
scenario maps to one user story's Independent Test. Request/response shapes are defined in
`contracts/api.openapi.yaml`; entity fields are defined in `data-model.md`.

## Prerequisites

- PostgreSQL 16+ running locally with the `pgvector` extension installed and enabled on the
  target database (`CREATE EXTENSION IF NOT EXISTS vector;`).
- Backend `.env` populated with `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, and a `DATABASE_URL`
  pointing at that Postgres instance.
- Database migrated to the schema in `data-model.md` (`documents`, `chunks` tables, HNSW + GIN
  indexes).
- Backend running (`npm run dev` in `backend/`) and frontend running (`npm run dev` in
  `frontend/`), or an equivalent combined dev script if one is added during implementation.
- Two sample PDFs available locally:
  1. A text-heavy PDF with an unambiguous factual statement (e.g., a policy doc stating a
     specific figure in prose).
  2. A PDF containing a bar/line chart whose data value is **not** restated anywhere in the
     surrounding text — needed to validate Principle III / User Story 3.

## Scenario 1 — Upload and index (User Story 1, P1)

1. In the UI, upload both sample PDFs at once.
2. **Expect**: both appear immediately in the document list with `status: queued`
   (`GET /documents`), then transition to `processing`, then `indexed` — no manual refresh
   required (SC-001).
3. While ingestion is in flight, navigate elsewhere in the UI (e.g., open the chat view).
   **Expect**: the UI never blocks or shows a loading lock screen (FR-005).
4. Upload a non-PDF file (e.g., a `.txt`). **Expect**: `POST /documents` returns `400` and the
   file never appears in the list (FR-002).

## Scenario 2 — Ask a question answered from body text (User Story 2, P2)

1. Once both documents show `indexed`, ask the chat UI the factual question whose answer is in
   sample PDF #1's prose.
2. **Expect** (`POST /query`): a response within ~5 seconds, `confident: true`, an `answer` that
   states the correct fact, and at least one `citation` whose `documentFilename` and `page`
   match the source PDF and page (SC-002, SC-005).
3. Ask a question with no relevant answer anywhere in the corpus (e.g., about an unrelated
   topic). **Expect**: `confident: false` and the fixed "couldn't find a confident answer"
   message, with `citations: []` (SC-004, FR-016).
4. Ask a question containing a verbatim code/identifier known to appear in sample PDF #1.
   **Expect**: the answer still cites the correct document — confirming the lexical search leg
   contributed (not just vector similarity) per Acceptance Scenario 4 of User Story 2.

## Scenario 3 — Answer from chart-only data (User Story 3, P3)

1. Ask a question whose answer exists only inside sample PDF #2's chart (e.g., "What was the
   value in year Y according to the chart?").
2. **Expect**: `confident: true`, the correct value in `answer`, and a citation pointing to the
   page containing that chart (SC-003).
3. Inspect the chunk backing that answer (e.g., via a debug query against `chunks` filtered by
   `chunk_type = 'figure'` for that document) — **expect** `figure_metadata` populated with
   `chart_type`, `axes`, `approximate_values`, and `trend` (FR-006, FR-008).

## Scenario 4 — Manage the corpus (User Story 4, P4)

1. `GET /documents` — confirm both sample documents are listed with `status: indexed`.
2. `DELETE /documents/{id}` for sample PDF #2.
3. **Expect**: `204`, the document no longer appears in `GET /documents`, and a follow-up
   `POST /query` for the chart question from Scenario 3 now returns `confident: false` (SC-006).
4. Confirm no orphaned rows remain: a query against `chunks` for the deleted `document_id`
   returns zero rows (FR-018, cascading delete per `data-model.md`).

## Automated coverage

- **Contract tests** (`backend/tests/contract/`): validate each endpoint in
  `contracts/api.openapi.yaml` against its request/response schema, independent of real
  ingestion/retrieval logic (mocked services).
- **Integration tests** (`backend/tests/integration/`): run Scenarios 1–4 above against a real
  test Postgres instance, with the Anthropic/Voyage API calls stubbed to fixed
  captions/embeddings/rerank scores so tests are deterministic and don't incur API cost.
- **E2E test** (`frontend/tests/e2e/`, Playwright): drives Scenario 1 + a happy-path question
  from Scenario 2 through the actual browser UI against a running backend, as the release gate
  for "the golden path works end-to-end."
