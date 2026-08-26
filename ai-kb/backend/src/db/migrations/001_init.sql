-- Knowledge Base Search MVP — initial schema (data-model.md)

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'indexed', 'failed')),
  status_reason TEXT,
  page_count INTEGER,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  indexed_at TIMESTAMPTZ,
  CONSTRAINT status_reason_only_when_failed CHECK (
    (status = 'failed' AND status_reason IS NOT NULL)
    OR (status != 'failed' AND status_reason IS NULL)
  )
);

-- Voyage AI embedding dimension: confirm against the live model card for the
-- embedding model in use before deploying (research.md §3-4); voyage-3 uses 1024.
CREATE TABLE IF NOT EXISTS chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_type TEXT NOT NULL CHECK (chunk_type IN ('text', 'figure')),
  text TEXT NOT NULL CHECK (length(text) > 0),
  embedding VECTOR(1024) NOT NULL,
  tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', text)) STORED,
  figure_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT figure_metadata_only_for_figures CHECK (
    (chunk_type = 'figure' AND figure_metadata IS NOT NULL)
    OR (chunk_type = 'text' AND figure_metadata IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS chunks_document_id_idx ON chunks (document_id);

-- HNSW over IVFFlat for MVP: no representative-sample training step needed,
-- which matters for a corpus that starts empty and grows incrementally
-- (research.md §7).
CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx
  ON chunks USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS chunks_tsv_gin_idx ON chunks USING gin (tsv);
