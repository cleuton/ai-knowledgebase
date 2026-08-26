import { query } from "../db/client.js";
import type { Document, DocumentStatus } from "./types.js";

interface DocumentRow {
  id: string;
  filename: string;
  status: DocumentStatus;
  status_reason: string | null;
  page_count: number | null;
  uploaded_at: string;
  indexed_at: string | null;
}

function toDocument(row: DocumentRow): Document {
  return {
    id: row.id,
    filename: row.filename,
    status: row.status,
    statusReason: row.status_reason,
    pageCount: row.page_count,
    uploadedAt: row.uploaded_at,
    indexedAt: row.indexed_at,
  };
}

export async function createDocument(filename: string): Promise<Document> {
  const result = await query<DocumentRow>(
    `INSERT INTO documents (filename, status) VALUES ($1, 'queued') RETURNING *`,
    [filename],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Failed to create document");
  return toDocument(row);
}

export async function listDocuments(): Promise<Document[]> {
  const result = await query<DocumentRow>(`SELECT * FROM documents ORDER BY uploaded_at DESC`);
  return result.rows.map(toDocument);
}

export async function getDocumentById(id: string): Promise<Document | null> {
  const result = await query<DocumentRow>(`SELECT * FROM documents WHERE id = $1`, [id]);
  const row = result.rows[0];
  return row ? toDocument(row) : null;
}

/** Returns false when the document no longer exists (e.g., deleted mid-ingestion —
 * spec.md Edge Cases), letting callers abort the pipeline stage in progress. */
export async function documentExists(id: string): Promise<boolean> {
  const result = await query(`SELECT 1 FROM documents WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

/** Batch filename lookup for citation display — avoids one query per cited
 * chunk when assembling a query response (FR-015). */
export async function getFilenamesByIds(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const result = await query<{ id: string; filename: string }>(
    `SELECT id, filename FROM documents WHERE id = ANY($1)`,
    [ids],
  );
  return new Map(result.rows.map((r) => [r.id, r.filename]));
}

export async function markProcessing(id: string): Promise<void> {
  await query(`UPDATE documents SET status = 'processing' WHERE id = $1`, [id]);
}

export async function markIndexed(id: string, pageCount: number): Promise<void> {
  await query(
    `UPDATE documents SET status = 'indexed', page_count = $2, indexed_at = now() WHERE id = $1`,
    [id, pageCount],
  );
}

export async function markFailed(id: string, reason: string): Promise<void> {
  await query(`UPDATE documents SET status = 'failed', status_reason = $2 WHERE id = $1`, [
    id,
    reason,
  ]);
}

export async function deleteDocument(id: string): Promise<boolean> {
  const result = await query(`DELETE FROM documents WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}
