// Shared domain types, mirroring data-model.md.

export type DocumentStatus = "queued" | "processing" | "indexed" | "failed";

export interface Document {
  id: string;
  filename: string;
  status: DocumentStatus;
  statusReason: string | null;
  pageCount: number | null;
  uploadedAt: string;
  indexedAt: string | null;
}

export type ChunkType = "text" | "figure";

export interface FigureMetadata {
  chartType: string;
  axes: string;
  approximateValues: Array<{ label: string; value: string }>;
  trend: string;
}

export interface Chunk {
  id: string;
  documentId: string;
  page: number;
  chunkIndex: number;
  chunkType: ChunkType;
  text: string;
  embedding: number[];
  figureMetadata: FigureMetadata | null;
  createdAt: string;
}

/** A chunk ranked by one or more retrieval stages. `score` is stage-specific
 * (cosine similarity, ts_rank_cd, RRF score, or rerank relevance) — callers
 * must not compare scores across stages. */
export interface ScoredChunk {
  chunk: Chunk;
  score: number;
}

export interface Citation {
  documentId: string;
  documentFilename: string;
  page: number;
}

export interface QuestionAnswerExchange {
  question: string;
  answer: string;
  confident: boolean;
  citations: Citation[];
}
