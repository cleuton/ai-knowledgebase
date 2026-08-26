<!--
Sync Impact Report
Version change: TEMPLATE → 1.0.0 (initial ratification)
Modified principles: n/a (first fill of template placeholders)
Added sections:
  - Core Principles I–VI (Hybrid Retrieval Is Baseline; Rerank Before Cutoff;
    Visual Data Is First-Class Queryable Text; Grounded Answers, Honest Absence;
    Structure-Aware Chunking & Single Source of Truth; MVP Scope Is a Commitment)
  - Technology Stack & Platform Constraints
  - Performance & Operational Standards
  - Governance (amendment procedure, versioning policy, compliance review)
Removed sections: none
Templates requiring updates:
  - ✅ .specify/templates/plan-template.md (Constitution Check gate derives from this
    file dynamically; no hardcoded principle names found, no edit needed)
  - ✅ .specify/templates/spec-template.md (no constitution-specific references found)
  - ✅ .specify/templates/tasks-template.md (no constitution-specific references found)
  - ✅ .specify/templates/checklist-template.md (no constitution-specific references found)
  - ⚠ No README.md / docs/quickstart.md exist yet in this project — nothing to sync;
    create these referencing the principles below when the project scaffold is built.
Follow-up TODOs: none — all placeholders resolved from the supplied MVP user story.
-->

# Knowledge Base Search System Constitution

## Core Principles

### I. Hybrid Retrieval Is Baseline, Not a Phase 2
Every query MUST run both a vector similarity search and a lexical (full-text)
search against the same corpus, with results fused into a single ranked list
(e.g., via Reciprocal Rank Fusion) before any further ranking step. Vector
similarity alone MUST NOT be shipped as the final ranking signal, at MVP or in
any later phase.
Rationale: Pure dense retrieval reliably misses exact terms, codes, and
identifiers that lexical search recovers; treating hybrid search as optional
or "phase 2" is the documented root cause of missed-answer failures this
project exists to avoid.

### II. Rerank Before Cutoff — No Naive Top-K
The fused candidate list (on the order of 30–50 candidates) MUST be passed
through a cross-encoder reranking model together with the original query
before any final cutoff is applied. Only the reranked top N (configurable,
default 8–10) MAY be passed to the generation step. A raw top-K taken
directly from initial vector similarity ranking MUST NEVER be used as the
final context.
Rationale: This is the single highest-leverage, most consistently evidenced
improvement over naive retrieval, and it directly prevents the failure mode
where the correct document is retrieved as a candidate but discarded before
generation by a fixed cutoff or competition from semantically-close
neighbors.

### III. Visual Data Is First-Class, Queryable Text
Every extracted image above the configured minimum size threshold MUST be
sent to a vision-capable model to produce a structured caption (chart type,
axes, approximate values, trend) plus a dense natural-language summary
optimized for embedding. The caption MUST be inserted into the document text
stream at the image's original position, wrapped in a clear marker (e.g.
`[FIGURE: ...]`), so it flows into chunking and embedding like any other
text. The structured JSON (raw values, chart type, etc.) MUST be retained
separately as chunk metadata. A question whose answer exists only inside a
chart or infographic MUST be answerable from the indexed caption text.
Rationale: Standard text extraction ignores charts and infographics
entirely; without this step, numeric and visual data is permanently
unsearchable and unanswerable, defeating a core goal of this system.

### IV. Grounded Answers, Honest Absence
Every claim in a generated answer MUST carry a citation to its source
document and page. If no retrieved chunk clears the minimum relevance bar,
the system MUST explicitly state that it could not find a confident answer.
The system MUST NEVER present the absence of retrieved evidence as if it
were a confirmed fact.
Rationale: A knowledge base that confidently answers from incomplete or
absent context is worse than one that admits uncertainty; this principle
protects users from being misled by the system's own retrieval gaps.

### V. Structure-Aware Chunking, Single Source of Truth
Documents MUST be split using a structure-aware/recursive chunking strategy
by default, respecting paragraphs and headings before falling back to raw
size cuts. Image captions MUST be treated as atomic chunks when reasonably
sized. Chunk size and overlap MUST be defined as configurable constants in
one place, never as hardcoded magic numbers scattered through the code. For
each chunk, the vector embedding, raw text, lexical index entry, and
metadata MUST live in the same Postgres row/table — no separate vector
database or search engine MAY be introduced at MVP — so both retrieval paths
always query the same source of truth.
Rationale: Structure-aware chunking is the best accuracy/cost trade-off for
mixed, moderately-structured technical PDFs. A single database as the
source of truth avoids cross-system sync bugs and is the right complexity
level for the MVP's corpus size.

### VI. MVP Scope Is a Commitment, Not a Placeholder
Agentic/multi-step orchestration, intelligent multi-source routing,
metadata pre-filtering UI, access control beyond a single authenticated
user base, multilingual query expansion/translation, and multi-turn
conversation memory are explicitly out of scope for this story. None of
these MAY be introduced into the implementation without first amending this
constitution and the governing spec/plan artifacts.
Rationale: Scope discipline is what makes hybrid search and reranking
affordable to build correctly from day one; silently reintroducing deferred
complexity undermines the deliberate trade-off this MVP is built on.

## Technology Stack & Platform Constraints

- **Frontend**: React + TypeScript. **Backend**: Node.js + TypeScript.
- **Storage**: PostgreSQL with the `pgvector` extension is the system of
  record for chunk text, vectors, and the lexical (`tsvector`/`tsquery`)
  index. No separate vector database or dedicated search engine MAY be
  introduced at MVP without a constitution amendment.
- **Embeddings & reranking**: Voyage AI APIs (embeddings and rerank
  endpoints) are the default providers for AC04–AC06.
- **Chart captioning & answer generation**: Anthropic API — a vision-capable
  Claude model for image/chart captioning (Principle III), and a Claude
  model for grounded answer generation (Principle IV).
- **PDF parsing**: a Node PDF parsing library capable of extracting both
  text and embedded images while preserving reading order and page number.
- Substituting any of the above (e.g., swapping the vector store, embedding
  provider, or generation model) is a platform-level decision and MUST be
  reflected here via amendment, not made silently in code.

## Performance & Operational Standards

- End-to-end query latency (question → rendered answer) MUST target under
  ~5 seconds for a corpus in the low-thousands-of-chunks range; retrieval
  and reranking are the expected dominant cost and MUST be budgeted for
  accordingly.
- PDF ingestion MUST run asynchronously in the background and MUST NOT
  block the UI; users MUST be able to continue working while indexing runs.
- Every uploaded document MUST expose an ingestion status (queued,
  processing, indexed, failed) so ingestion is never a black box to the
  user.
- Deleting a document MUST remove its chunks from both the vector and
  lexical indexes; partial deletion that leaves orphaned index entries is a
  defect, not an acceptable MVP limitation.

## Governance

This constitution supersedes ad hoc engineering practice for this project.
Any spec, plan, or PR that conflicts with a principle above MUST either be
revised to comply or be accompanied by an explicit constitution amendment
justifying the deviation.

**Amendment procedure**: propose the change with rationale, update this
document (via the constitution command/skill), bump the version per the
policy below, and update any dependent templates (plan/spec/tasks/checklist)
flagged as needing sync in the amendment's Sync Impact Report.

**Versioning policy** (semantic versioning applied to this document):
- **MAJOR** — backward-incompatible principle removal or redefinition.
- **MINOR** — a new principle or materially expanded guidance is added.
- **PATCH** — clarifications, wording, or typo fixes with no semantic
  change.

**Compliance review**: every `/speckit-plan` and `/speckit-tasks` run MUST
include a Constitution Check confirming the proposed design still satisfies
hybrid retrieval, reranking-before-cutoff, figure-captioning, and citation
requirements before implementation proceeds. Complexity that violates a
principle MUST be justified in the plan's Complexity Tracking table or
rejected.

**Version**: 1.0.0 | **Ratified**: 2026-08-26 | **Last Amended**: 2026-08-26
