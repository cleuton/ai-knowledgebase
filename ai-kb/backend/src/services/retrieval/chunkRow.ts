import type { Chunk, FigureMetadata } from "../../models/types.js";

export interface ChunkRow {
  id: string;
  document_id: string;
  page: number;
  chunk_index: number;
  chunk_type: "text" | "figure";
  text: string;
  figure_metadata: FigureMetadata | null;
  created_at: string;
}

/** Chunk rows are read for ranking, not for re-embedding, so `embedding` is
 * left empty here rather than selected and parsed on every retrieval query. */
export function toChunk(row: ChunkRow): Chunk {
  return {
    id: row.id,
    documentId: row.document_id,
    page: row.page,
    chunkIndex: row.chunk_index,
    chunkType: row.chunk_type,
    text: row.text,
    embedding: [],
    figureMetadata: row.figure_metadata,
    createdAt: row.created_at,
  };
}
