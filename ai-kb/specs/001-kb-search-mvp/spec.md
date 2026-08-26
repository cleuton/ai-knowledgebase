# Feature Specification: Knowledge Base Search MVP

**Feature Branch**: `001-kb-search-mvp`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "Build a Knowledge Base search MVP that ingests a corpus of PDF documents (including documents containing charts, graphs, and infographics), indexes them for both lexical and vector search, and answers natural-language questions with grounded, cited answers. Users upload PDF files through a web UI. The system extracts text and images per page, and every extracted chart/image is sent to a vision-capable model to generate a structured caption (chart type, axes, approximate values, trend, and a dense natural-language summary). This caption is inserted back into the document text at the image's original position, so visual data becomes searchable the same way as body text. Documents are chunked using a structure-aware/recursive strategy, respecting paragraphs and headings. Image captions are kept as atomic chunks when reasonably sized. Each chunk is embedded and stored in PostgreSQL with pgvector, alongside a full-text search column, so the same table serves both vector and lexical retrieval. When a user asks a question, the system runs both a vector similarity search and a lexical full-text search, fuses the two ranked candidate lists (reciprocal rank fusion), and passes the fused candidates through a cross-encoder reranking step before selecting the final top chunks for context. This hybrid search + rerank pipeline is required from the start. The reranked top chunks are assembled into context and sent to an LLM to generate the final answer, which must include citations (source document + page) for every claim. If no retrieved chunk clears a minimum relevance bar, the system must explicitly say it could not find a confident answer. Users can also view a list of indexed documents with their ingestion status (queued, processing, indexed, failed) and delete a document, which removes its chunks from both the vector and lexical indexes. Out of scope: agentic/multi-step orchestration, intelligent multi-source routing, metadata pre-filtering UI, access control beyond a single authenticated user base, multilingual query expansion, multi-turn conversation memory, and non-PDF file types."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Upload and Index a PDF Corpus (Priority: P1)

A knowledge worker uploads a set of PDF documents through the web UI and watches each one move through ingestion — queued, processing, indexed (or failed) — so they always know whether the corpus is ready to be queried.

**Why this priority**: Nothing else in the system has value until documents are indexed. This is the foundational capability every other story depends on.

**Independent Test**: Upload one or more PDF files (including at least one containing a chart/graph) through the UI. Confirm each document's status visibly progresses from queued to indexed, the UI remains usable while ingestion runs in the background, and a failed document (e.g., a corrupted file) is clearly reported as failed rather than left ambiguous.

**Acceptance Scenarios**:

1. **Given** a knowledge worker has one or more PDF files ready, **When** they upload the files through the UI, **Then** each file appears in the document list with a "queued" status that progresses to "processing" and then "indexed" without requiring a page reload.
2. **Given** an ingestion job is running for a document, **When** the user continues browsing or uploads additional documents, **Then** the UI remains fully responsive and is never blocked waiting for ingestion to finish.
3. **Given** a document fails to process (e.g., corrupted or unreadable PDF), **When** ingestion encounters the failure, **Then** the document's status shows "failed" with a human-readable reason instead of silently disappearing or hanging.

---

### User Story 2 - Ask a Question and Get a Grounded, Cited Answer (Priority: P2)

A knowledge worker asks a natural-language question in a chat-style UI and receives a direct answer with citations pointing to the exact source document and page, built from the most relevant content in the corpus rather than whatever happened to survive a naive cutoff.

**Why this priority**: This is the core value proposition of the product — the reason the knowledge base exists — but it depends on a corpus already indexed by Story 1.

**Independent Test**: With a corpus already indexed, ask a question whose answer is clearly present in the body text of one document. Confirm the returned answer is correct and every claim carries a citation (document + page) that a reviewer can check against the source.

**Acceptance Scenarios**:

1. **Given** an indexed corpus containing the answer to a question in ordinary body text, **When** the user asks that question, **Then** the system returns an accurate answer with a citation to the correct source document and page.
2. **Given** the same question is asked, **When** the answer is generated, **Then** every distinct claim in the answer is traceable to a citation, not just the answer as a whole.
3. **Given** an indexed corpus that does not contain information relevant to a question, **When** the user asks that question, **Then** the system explicitly states it could not find a confident answer instead of producing a guess.
4. **Given** the user asks a question containing an exact code, identifier, or specific term that appears verbatim in a document, **When** the system retrieves candidates, **Then** the document containing that exact term is found and considered for the answer (not missed due to relying on semantic similarity alone).

---

### User Story 3 - Answer Questions From Chart and Infographic Data (Priority: P3)

A knowledge worker asks a question whose answer exists only inside a chart, graph, or infographic image in a PDF — not anywhere in the surrounding body text — and still receives an accurate, cited answer.

**Why this priority**: This is what differentiates the system from a naive text-only knowledge base and directly delivers on the stated goal of making visual data queryable, but it is an enhancement layered on top of the core retrieval flow from Story 2.

**Independent Test**: Upload a PDF containing a chart or infographic whose data value is not restated anywhere in the surrounding text. Ask a question that can only be answered by reading that chart (e.g., "what was the value in year Y according to the chart?"). Confirm the system returns the correct value with a citation to the document and page containing the chart.

**Acceptance Scenarios**:

1. **Given** a PDF containing a chart whose values are not described in any surrounding text, **When** the document is ingested, **Then** a structured caption describing the chart (type, axes, approximate values, trend, and a natural-language summary) becomes part of the searchable corpus.
2. **Given** that document is indexed, **When** the user asks a question whose answer lives only in that chart, **Then** the system returns the correct value with a citation to the document and page containing the chart.
3. **Given** an image on a page is too small to plausibly be a meaningful chart or figure (e.g., a decorative icon or logo), **When** the document is ingested, **Then** that image is not captioned or inserted into the searchable text.

---

### User Story 4 - Manage the Document Corpus (Priority: P4)

A knowledge worker reviews the list of documents currently in the knowledge base, checks their status, and removes a document that should no longer be part of the corpus.

**Why this priority**: Keeps the corpus trustworthy and current, but is a supporting/maintenance capability rather than the primary value delivery.

**Independent Test**: With a corpus containing at least one indexed document, delete that document and confirm a question previously answerable from it no longer surfaces that document's content as a source.

**Acceptance Scenarios**:

1. **Given** one or more documents have been uploaded, **When** the user views the document list, **Then** they see each document's name and current ingestion status.
2. **Given** an indexed document is selected for deletion, **When** the deletion completes, **Then** the document no longer appears in the list and none of its content is returned by future questions.
3. **Given** a document is deleted, **When** the deletion completes, **Then** all of that document's chunks are removed from both the vector index and the lexical index — no orphaned entries remain in either.

---

### Edge Cases

- Uploading a file that is not a PDF is rejected with a clear error message before ingestion begins.
- A PDF page containing neither extractable text nor images contributes no content to the index; the rest of the document still ingests normally.
- A captioning or indexing step fails partway through a document: the document is marked "failed" with the reason surfaced to the user, and the user can re-upload to retry.
- A user deletes a document while it is still "processing": ingestion for that document stops and none of its partial content ever becomes queryable.
- Two different documents contain conflicting information relevant to the same question: the answer cites all sources it drew on; reconciling the contradiction is left to the user.
- A question is asked before any document has finished indexing: the system tells the user it found no confident answer rather than treating an empty corpus as proof the information doesn't exist.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to upload one or more PDF files through the web UI.
- **FR-002**: System MUST reject uploaded files that are not PDFs with a clear error message.
- **FR-003**: System MUST extract text and images from each page of an uploaded PDF, preserving reading order and page number.
- **FR-004**: System MUST report and display a per-document ingestion status (queued, processing, indexed, or failed) that updates as ingestion progresses.
- **FR-005**: System MUST process ingestion (parsing, captioning, chunking, embedding, indexing) asynchronously in the background without blocking the user from continuing to use the UI.
- **FR-006**: For every extracted image at or above a minimum size threshold, System MUST generate a structured caption describing chart type, axes, approximate values, trend, and a natural-language summary.
- **FR-007**: System MUST insert each generated image caption into the document's text stream at the image's original position, clearly marked as a figure, so it flows into chunking the same as surrounding body text.
- **FR-008**: System MUST retain each image's structured chart data (raw values, chart type, etc.) as retrievable metadata, separate from the embedded caption text.
- **FR-009**: System MUST split each document into chunks using a structure-aware strategy that respects paragraph and heading boundaries before falling back to fixed-size splitting.
- **FR-010**: System MUST keep each image caption as a single atomic chunk when it fits within the standard chunk size; oversized captions may be split as a known limitation.
- **FR-011**: System MUST index every chunk for both vector similarity search and lexical (keyword/full-text) search against the same underlying corpus.
- **FR-012**: When a user submits a question, System MUST retrieve candidates via both vector similarity search and lexical search and fuse them into a single ranked candidate list.
- **FR-013**: System MUST rerank the fused candidate list before selecting the chunks used to answer the question; the initial vector-only ranking MUST NOT be used as the final selection.
- **FR-014**: System MUST generate the answer using only the reranked top chunks as supporting context.
- **FR-015**: Every claim in a generated answer MUST include a citation identifying its source document and page number.
- **FR-016**: When no retrieved chunk meets a minimum relevance threshold, System MUST respond that it could not find a confident answer instead of generating an answer from insufficient context.
- **FR-017**: Users MUST be able to view a list of uploaded documents along with each document's current ingestion status.
- **FR-018**: Users MUST be able to delete a document, and System MUST remove all of that document's chunks from both the vector index and the lexical index as part of deletion.
- **FR-019**: System MUST operate as a single-tenant application scoped to one workspace/corpus; no login, authentication, or multi-user access control is implemented in this MVP — the API surface is assumed to run behind a trusted, single-user deployment boundary.

### Key Entities

- **Document**: An uploaded PDF and its ingestion lifecycle. Key attributes: filename, ingestion status, page count, upload timestamp.
- **Chunk**: A unit of retrievable content derived from a document. Key attributes: source document, page number, chunk type (body text or figure caption), text content, and (for figure chunks) structured chart metadata.
- **Figure Caption**: The structured description generated for an extracted chart/image. Key attributes: chart type, axes, approximate values, trend, natural-language summary, and position within the source document.
- **Question/Answer Exchange**: A user's question and the system's response. Key attributes: question text, generated answer text, list of citations, and a confident/no-confident-answer indicator.
- **Citation**: A reference within an answer pointing to a specific source document and page.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can upload a set of PDF documents and watch each one progress from queued to indexed, continuing to use the UI throughout, without ever needing to wait idle for ingestion to finish.
- **SC-002**: A user asking a question whose answer exists in the corpus's body text receives an accurate, cited answer within about 5 seconds, for a corpus containing up to a few thousand chunks.
- **SC-003**: A user asking a question whose answer exists only inside a chart, graph, or infographic receives a correct, cited answer at the same reliability as questions answered from body text.
- **SC-004**: When the corpus contains no information relevant to a question, the user is told the system could not find a confident answer rather than receiving a fabricated one, every time, in testing.
- **SC-005**: Every claim in every generated answer carries a citation that a reviewer can verify against the actual source document and page.
- **SC-006**: After a user deletes a document, no subsequent answer draws on that document's content.

## Assumptions

- A single-tenant, unauthenticated deployment is assumed for this MVP (e.g., run behind a private network or an external reverse-proxy auth layer); no login flow, session management, or role-based permissions are built into the application itself.
- No hard limit is placed on the number or size of uploaded PDFs beyond what keeps the stated low-thousands-of-chunks performance target realistic; very large corpora are out of scope for MVP performance guarantees.
- The minimum image size threshold for figure captioning and the minimum relevance bar for "no confident answer" are internal tunable settings, not user-facing configuration, for this MVP.
- Duplicate uploads of the same PDF are allowed and tracked as independent document entries; deduplication is not required for MVP.
- Re-indexing an already-ingested document is not included in this iteration; a document must be deleted and re-uploaded to refresh its content.
- Corrupted, encrypted, or otherwise unreadable PDFs are reported with a "failed" ingestion status and a human-readable error reason rather than silently dropped.
- Citations are presented as document name + page number; deep-linking directly into a rendered PDF viewer is not required for MVP.
