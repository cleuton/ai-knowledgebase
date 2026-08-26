import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Requires a real Postgres+pgvector instance at TEST_DATABASE_URL (or
// DATABASE_URL). Skipped automatically otherwise — this is a live-infra
// integration test, not a unit test (quickstart.md's Automated Coverage
// section; tasks.md T047 note in README.md's Known MVP Limitations).
const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

vi.mock("../../src/services/ingestion/embeddings.js", () => ({
  // A tiny deterministic stub in place of a real Voyage AI call — proves the
  // DB read/write paths (pgvector insert + cosine search, tsvector search,
  // RRF fusion) work against a real Postgres instance without requiring a
  // live Voyage API key in this environment.
  embedTexts: vi.fn(async (texts: string[]) =>
    texts.map((t) => {
      const vec = new Array(1024).fill(0);
      for (let i = 0; i < t.length; i++) vec[i % 1024] += t.charCodeAt(i) / 1000;
      return vec;
    }),
  ),
  embedText: vi.fn(async (t: string) => {
    const vec = new Array(1024).fill(0);
    for (let i = 0; i < t.length; i++) vec[i % 1024] += t.charCodeAt(i) / 1000;
    return vec;
  }),
}));

describe.skipIf(!databaseUrl)("retrieval against a real Postgres+pgvector instance", () => {
  let documentId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.ANTHROPIC_API_KEY ??= "test";
    process.env.VOYAGE_API_KEY ??= "test";

    const { createDocument } = await import("../../src/models/documentRepository.js");
    const { indexChunks } = await import("../../src/services/ingestion/indexer.js");

    const doc = await createDocument("retrieval-test.pdf");
    documentId = doc.id;

    await indexChunks(documentId, [
      { page: 1, chunkType: "text", text: "The annual revenue in 2023 was 42 million dollars." },
      { page: 2, chunkType: "text", text: "Employee headcount grew to 300 people by year end." },
    ]);
  });

  afterAll(async () => {
    const { deleteDocument } = await import("../../src/models/documentRepository.js");
    const { closePool } = await import("../../src/db/client.js");
    await deleteDocument(documentId);
    await closePool();
  });

  it("finds an indexed chunk via vector search", async () => {
    const { vectorSearch } = await import("../../src/services/retrieval/vectorSearch.js");
    const { embedText } = await import("../../src/services/ingestion/embeddings.js");
    const queryEmbedding = await embedText("revenue in 2023", "query");
    const results = await vectorSearch(queryEmbedding, 10);
    expect(results.some((r) => r.chunk.documentId === documentId)).toBe(true);
  });

  it("finds an indexed chunk via lexical search on an exact term", async () => {
    const { lexicalSearch } = await import("../../src/services/retrieval/lexicalSearch.js");
    const results = await lexicalSearch("headcount", 10);
    expect(results.some((r) => r.chunk.documentId === documentId)).toBe(true);
  });

  it("fuses vector and lexical results via RRF", async () => {
    const { vectorSearch } = await import("../../src/services/retrieval/vectorSearch.js");
    const { lexicalSearch } = await import("../../src/services/retrieval/lexicalSearch.js");
    const { reciprocalRankFusion } = await import("../../src/services/retrieval/fusion.js");
    const { embedText } = await import("../../src/services/ingestion/embeddings.js");

    const queryEmbedding = await embedText("revenue", "query");
    const [vectorResults, lexicalResults] = await Promise.all([
      vectorSearch(queryEmbedding, 10),
      lexicalSearch("revenue", 10),
    ]);
    const fused = reciprocalRankFusion(vectorResults, lexicalResults);
    expect(fused.length).toBeGreaterThan(0);
    expect(fused[0]!.score).toBeGreaterThan(0);
  });

  it("deleting the document removes its chunks (cascade)", async () => {
    const { deleteDocument, documentExists } = await import("../../src/models/documentRepository.js");
    const { query } = await import("../../src/db/client.js");

    await deleteDocument(documentId);
    expect(await documentExists(documentId)).toBe(false);

    const remaining = await query("SELECT 1 FROM chunks WHERE document_id = $1", [documentId]);
    expect(remaining.rowCount).toBe(0);
  });
});
