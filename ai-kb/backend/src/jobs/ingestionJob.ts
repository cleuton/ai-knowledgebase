import type PgBoss from "pg-boss";
import { logger, logStageLatency } from "../lib/logger.js";
import {
  documentExists,
  markFailed,
  markIndexed,
  markProcessing,
} from "../models/documentRepository.js";
import { loadPdf, extractPageText } from "../services/ingestion/pdfText.js";
import { extractPageImages } from "../services/ingestion/pdfImages.js";
import { assemblePageBlocks } from "../services/ingestion/pdfAssembler.js";
import { chunkPageBlocks, type RawChunk } from "../services/ingestion/chunker.js";
import { indexChunks } from "../services/ingestion/indexer.js";
import { INGESTION_QUEUE, getQueue, type IngestionJobData } from "./queue.js";

const pdfBuffers = new Map<string, Buffer>();

/** The uploaded PDF's bytes are handed off in-process from the upload route to
 * the worker rather than round-tripped through the job payload (pg-boss jobs
 * are persisted as JSON) or a separate blob store — an acceptable MVP
 * simplification since the API and worker run in the same process/deployment
 * unit. Consumed (and removed) exactly once by the job handler. */
export function stagePdfBuffer(documentId: string, buffer: Buffer): void {
  pdfBuffers.set(documentId, buffer);
}

/** Runs the full ingestion pipeline for one document, per page: parse text +
 * images → caption qualifying images and splice into the text stream → chunk
 * → embed → index → update status. Aborts cleanly if the document was
 * deleted mid-flight (spec.md Edge Cases) and marks the document `failed`
 * with a human-readable reason on any unrecoverable error (FR-004, Edge
 * Cases). */
async function processDocument(documentId: string): Promise<void> {
  const startedAt = Date.now();
  const buffer = pdfBuffers.get(documentId);
  pdfBuffers.delete(documentId);

  if (!buffer) {
    logger.error({ documentId }, "ingestion job has no staged PDF buffer — skipping");
    return;
  }

  if (!(await documentExists(documentId))) return; // deleted before processing started

  try {
    await markProcessing(documentId);

    const pdf = await loadPdf(buffer);
    const chunks: RawChunk[] = [];

    // Parse + caption + chunk one page at a time (rather than pdfText's
    // extractDocumentText helper) so each page's images can be captioned
    // and spliced into the text stream at their original position before
    // that page is chunked (FR-003, FR-007, User Story 3).
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      try {
        const [textBlocks, images] = await Promise.all([
          extractPageText(page),
          extractPageImages(page, pageNumber),
        ]);
        const viewport = page.getViewport({ scale: 1 });
        const blocks = await assemblePageBlocks(
          pageNumber,
          textBlocks,
          images,
          viewport.width,
          viewport.height,
        );
        chunks.push(...chunkPageBlocks(pageNumber, blocks));
      } finally {
        page.cleanup();
      }

      if (!(await documentExists(documentId))) return; // deleted mid-parse
    }

    await indexChunks(documentId, chunks);

    if (!(await documentExists(documentId))) return; // deleted mid-index

    await markIndexed(documentId, pdf.numPages);
    logStageLatency("ingestion", startedAt, { documentId, pageCount: pdf.numPages, chunkCount: chunks.length });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown ingestion error";
    logger.error({ documentId, err }, "ingestion failed");
    if (await documentExists(documentId)) {
      await markFailed(documentId, reason);
    }
  }
}

export async function registerIngestionWorker(boss: PgBoss): Promise<void> {
  await boss.work<IngestionJobData>(INGESTION_QUEUE, async ([job]) => {
    if (!job) return;
    await processDocument(job.data.documentId);
  });
}

export async function enqueueIngestion(documentId: string): Promise<void> {
  const boss = await getQueue();
  await boss.send(INGESTION_QUEUE, { documentId } satisfies IngestionJobData);
}
