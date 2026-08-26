import pgvector from "pgvector";
import { query } from "../../db/client.js";
import { embedTexts } from "./embeddings.js";
import type { RawChunk } from "./chunker.js";

/** Embeds and inserts a document's chunks in one batch. Each chunk row carries
 * its own vector, raw text, and (for figures) structured metadata in the same
 * table the lexical `tsv` generated column also lives on — one source of
 * truth for both retrieval paths (FR-011, constitution Principle V). */
export async function indexChunks(documentId: string, chunks: RawChunk[]): Promise<void> {
  if (chunks.length === 0) return;

  const embeddings = await embedTexts(
    chunks.map((c) => c.text),
    "document",
  );

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = embeddings[i];
    if (!chunk || !embedding) continue;
    await query(
      `INSERT INTO chunks (document_id, page, chunk_index, chunk_type, text, embedding, figure_metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        documentId,
        chunk.page,
        i,
        chunk.chunkType,
        chunk.text,
        pgvector.toSql(embedding),
        chunk.figureMetadata ? JSON.stringify(chunk.figureMetadata) : null,
      ],
    );
  }
}
