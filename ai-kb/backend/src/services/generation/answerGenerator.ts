import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "../../config/env.js";
import { FIXED_NO_CONFIDENT_ANSWER_MESSAGE } from "../../config/constants.js";
import type { Citation, ScoredChunk, QuestionAnswerExchange } from "../../models/types.js";

const GENERATION_MODEL = "claude-sonnet-5";

export interface ContextSource {
  index: number; // 1-based, matches the [n] markers in the prompt and answer
  scoredChunk: ScoredChunk;
  documentFilename: string;
}

function buildSourcesBlock(sources: ContextSource[]): string {
  return sources
    .map(
      (s) =>
        `[${s.index}] (source: "${s.documentFilename}", page ${s.scoredChunk.chunk.page})\n${s.scoredChunk.chunk.text}`,
    )
    .join("\n\n");
}

const SYSTEM_PROMPT = `You are a knowledge base assistant. Answer the user's question using ONLY the
numbered sources provided — never use outside knowledge, and never guess.

Rules:
- Every sentence in your answer MUST end with one or more citation markers like [1] or [1][3]
  referencing the source numbers that support that sentence.
- If the sources don't fully support a claim, omit that claim rather than guessing.
- If none of the sources answer the question at all, respond with exactly: NO_CONFIDENT_ANSWER
- Keep the answer concise and direct.`;

/** Splits on sentence-ending punctuation; good enough for the attribution
 * check below without pulling in a full sentence tokenizer. */
function splitSentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) ?? [text]).map((s) => s.trim()).filter(Boolean);
}

function everySentenceIsCited(answer: string): boolean {
  const sentences = splitSentences(answer);
  return sentences.length > 0 && sentences.every((s) => /\[\d+\]/.test(s));
}

function extractCitations(answer: string, sources: ContextSource[]): Citation[] {
  const usedIndexes = new Set(
    [...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])),
  );
  const bySources = new Map(sources.map((s) => [s.index, s]));
  const citations: Citation[] = [];
  const seen = new Set<string>();
  for (const index of usedIndexes) {
    const source = bySources.get(index);
    if (!source) continue;
    const key = `${source.scoredChunk.chunk.documentId}:${source.scoredChunk.chunk.page}`;
    if (seen.has(key)) continue;
    seen.add(key);
    citations.push({
      documentId: source.scoredChunk.chunk.documentId,
      documentFilename: source.documentFilename,
      page: source.scoredChunk.chunk.page,
    });
  }
  return citations;
}

async function callClaude(client: Anthropic, question: string, sources: ContextSource[]): Promise<string> {
  const response = await client.messages.create({
    model: GENERATION_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Sources:\n\n${buildSourcesBlock(sources)}\n\nQuestion: ${question}`,
      },
    ],
  });
  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock?.type === "text" ? textBlock.text.trim() : "";
}

function noConfidentAnswer(question: string): QuestionAnswerExchange {
  return { question, answer: FIXED_NO_CONFIDENT_ANSWER_MESSAGE, confident: false, citations: [] };
}

/** Generates a citation-grounded answer, retrying once if the model produces
 * unattributed claims, then falling back to an honest refusal rather than
 * shipping a partially-ungrounded answer (data-model.md Citation validation
 * rule, constitution Principle IV, FR-015/FR-016). Assumes the caller has
 * already confirmed confidenceGate.isConfident() for these sources. */
export async function generateAnswer(
  question: string,
  sources: ContextSource[],
): Promise<QuestionAnswerExchange> {
  const client = new Anthropic({ apiKey: getEnv().anthropicApiKey });

  for (let attempt = 0; attempt < 2; attempt++) {
    const answer = await callClaude(client, question, sources);

    if (answer === "NO_CONFIDENT_ANSWER" || answer.length === 0) {
      return noConfidentAnswer(question);
    }
    if (everySentenceIsCited(answer)) {
      return { question, answer, confident: true, citations: extractCitations(answer, sources) };
    }
  }

  return noConfidentAnswer(question);
}
