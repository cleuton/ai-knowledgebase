import type { FastifyInstance } from "fastify";
import { logStageLatency } from "../../lib/logger.js";
import { getFilenamesByIds } from "../../models/documentRepository.js";
import { embedText } from "../../services/ingestion/embeddings.js";
import { vectorSearch } from "../../services/retrieval/vectorSearch.js";
import { lexicalSearch } from "../../services/retrieval/lexicalSearch.js";
import { reciprocalRankFusion } from "../../services/retrieval/fusion.js";
import { rerank } from "../../services/retrieval/rerank.js";
import { isConfident } from "../../services/generation/confidenceGate.js";
import { generateAnswer, type ContextSource } from "../../services/generation/answerGenerator.js";
import { FIXED_NO_CONFIDENT_ANSWER_MESSAGE } from "../../config/constants.js";
import { querySchema, parseOrBadRequest } from "../schemas.js";

export async function registerQueryRoutes(app: FastifyInstance): Promise<void> {
  // POST /query — FR-012 through FR-016 (hybrid retrieval -> fusion -> rerank
  // -> confidence gate -> citation-grounded generation).
  app.post("/query", async (request, reply) => {
    const parsed = parseOrBadRequest(querySchema, request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: parsed.message });
    }
    const { question } = parsed.data;

    const overallStart = Date.now();

    const retrievalStart = Date.now();
    const queryEmbedding = await embedText(question, "query");
    const [vectorResults, lexicalResults] = await Promise.all([
      vectorSearch(queryEmbedding),
      lexicalSearch(question),
    ]);
    const fused = reciprocalRankFusion(vectorResults, lexicalResults);
    logStageLatency("retrieval", retrievalStart, { candidateCount: fused.length });

    const rerankStart = Date.now();
    const reranked = await rerank(question, fused);
    logStageLatency("rerank", rerankStart, { rerankedCount: reranked.length });

    if (!isConfident(reranked)) {
      logStageLatency("query-total", overallStart, { confident: false });
      return { question, answer: FIXED_NO_CONFIDENT_ANSWER_MESSAGE, confident: false, citations: [] };
    }

    const filenames = await getFilenamesByIds([...new Set(reranked.map((r) => r.chunk.documentId))]);
    const sources: ContextSource[] = reranked.map((scoredChunk, i) => ({
      index: i + 1,
      scoredChunk,
      documentFilename: filenames.get(scoredChunk.chunk.documentId) ?? "Unknown document",
    }));

    const generationStart = Date.now();
    const exchange = await generateAnswer(question, sources);
    logStageLatency("generation", generationStart);
    logStageLatency("query-total", overallStart, { confident: exchange.confident });

    return exchange;
  });
}
