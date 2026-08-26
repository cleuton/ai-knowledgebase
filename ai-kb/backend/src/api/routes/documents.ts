import type { FastifyInstance } from "fastify";
import {
  createDocument,
  deleteDocument,
  listDocuments,
} from "../../models/documentRepository.js";
import { enqueueIngestion, stagePdfBuffer } from "../../jobs/ingestionJob.js";
import { documentIdParamSchema, parseOrBadRequest } from "../schemas.js";

function toDocumentResponse(doc: Awaited<ReturnType<typeof listDocuments>>[number]) {
  return {
    id: doc.id,
    filename: doc.filename,
    status: doc.status,
    statusReason: doc.statusReason,
    pageCount: doc.pageCount,
    uploadedAt: doc.uploadedAt,
    indexedAt: doc.indexedAt,
  };
}

export async function registerDocumentRoutes(app: FastifyInstance): Promise<void> {
  // POST /documents — FR-001, FR-002, FR-005
  app.post("/documents", async (request, reply) => {
    const parts = request.parts();
    const created = [];

    for await (const part of parts) {
      if (part.type !== "file") continue;

      const isPdf =
        part.mimetype === "application/pdf" || part.filename.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        return reply.status(400).send({ message: `"${part.filename}" is not a PDF file` });
      }

      const buffer = await part.toBuffer();
      const doc = await createDocument(part.filename);
      stagePdfBuffer(doc.id, buffer);
      await enqueueIngestion(doc.id);
      created.push(doc);
    }

    if (created.length === 0) {
      return reply.status(400).send({ message: "No files were provided" });
    }

    return reply.status(202).send({ documents: created.map(toDocumentResponse) });
  });

  // GET /documents — FR-017
  app.get("/documents", async () => {
    const documents = await listDocuments();
    return { documents: documents.map(toDocumentResponse) };
  });

  // DELETE /documents/:documentId — FR-018 (User Story 4)
  app.delete("/documents/:documentId", async (request, reply) => {
    const parsed = parseOrBadRequest(documentIdParamSchema, request.params);
    if (!parsed.success) {
      return reply.status(400).send({ message: parsed.message });
    }
    const deleted = await deleteDocument(parsed.data.documentId);
    if (!deleted) {
      return reply.status(404).send({ message: "Document not found" });
    }
    return reply.status(204).send();
  });
}
