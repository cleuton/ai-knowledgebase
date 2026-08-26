import { CHUNK_SIZE, CHUNK_OVERLAP } from "../../config/constants.js";

export interface RawChunk {
  page: number;
  chunkType: "text" | "figure";
  text: string;
  figureMetadata?: unknown;
}

/** Rough token estimate — good enough for chunk-sizing decisions without
 * pulling in a full tokenizer for an MVP (~4 chars/token in English prose). */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function splitOnBlank(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g);
  return (parts ?? [text]).map((s) => s.trim()).filter(Boolean);
}

/** Structure-aware/recursive split: paragraphs first, then sentences, then a
 * hard character cut as the last resort — never mid-word where avoidable.
 * FR-009 / constitution Principle V. */
function splitText(text: string, maxTokens: number): string[] {
  if (estimateTokens(text) <= maxTokens) return [text];

  const paragraphs = splitOnBlank(text);
  if (paragraphs.length > 1) {
    return paragraphs.flatMap((p) => splitText(p, maxTokens));
  }

  const sentences = splitSentences(text);
  if (sentences.length > 1) {
    return packUnits(sentences, maxTokens);
  }

  // Single oversized unit with no natural break — hard cut (FR-010's
  // accepted limitation for oversized atomic units).
  const maxChars = maxTokens * 4;
  const pieces: string[] = [];
  for (let i = 0; i < text.length; i += maxChars) {
    pieces.push(text.slice(i, i + maxChars));
  }
  return pieces;
}

/** Greedily packs small units (sentences/paragraphs) into ~CHUNK_SIZE chunks. */
function packUnits(units: string[], maxTokens: number): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const unit of units) {
    const candidate = current ? `${current} ${unit}` : unit;
    if (estimateTokens(candidate) > maxTokens && current) {
      chunks.push(current);
      current = unit;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function withOverlap(chunks: string[]): string[] {
  if (chunks.length <= 1) return chunks;
  const overlapChars = CHUNK_OVERLAP * 4;
  return chunks.map((chunk, i) => {
    if (i === 0) return chunk;
    const prev = chunks[i - 1] ?? "";
    const tail = prev.slice(Math.max(0, prev.length - overlapChars));
    return `${tail} ${chunk}`.trim();
  });
}

/** Splits one page's body text into structure-aware chunks (FR-009). */
export function chunkPageText(page: number, text: string): RawChunk[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const pieces = withOverlap(splitText(trimmed, CHUNK_SIZE));
  return pieces.map((text) => ({ page, chunkType: "text" as const, text }));
}

/** Figure captions are kept atomic when they fit within CHUNK_SIZE; oversized
 * captions fall back to the same recursive splitter (FR-010, accepted
 * MVP limitation) and lose their figureMetadata association on the split
 * pieces after the first, since metadata describes the whole figure. */
export function chunkFigureCaption(
  page: number,
  captionText: string,
  figureMetadata: unknown,
): RawChunk[] {
  if (estimateTokens(captionText) <= CHUNK_SIZE) {
    return [{ page, chunkType: "figure", text: captionText, figureMetadata }];
  }
  const pieces = splitText(captionText, CHUNK_SIZE);
  return pieces.map((text) => ({ page, chunkType: "figure" as const, text, figureMetadata }));
}

interface StreamBlock {
  text: string;
  chunkType: "text" | "figure";
  figureMetadata?: unknown;
}

/** Chunks an ordered page block stream (interleaved text + figure captions
 * from pdfAssembler.ts), preserving stream order: consecutive text blocks
 * are joined and run through the recursive splitter, while each figure
 * block becomes its own atomic chunk in place (FR-007, FR-010). */
export function chunkPageBlocks(page: number, blocks: StreamBlock[]): RawChunk[] {
  const chunks: RawChunk[] = [];
  let textRun: string[] = [];

  const flushTextRun = () => {
    if (textRun.length > 0) {
      chunks.push(...chunkPageText(page, textRun.join("\n")));
      textRun = [];
    }
  };

  for (const block of blocks) {
    if (block.chunkType === "text") {
      textRun.push(block.text);
    } else {
      flushTextRun();
      chunks.push(...chunkFigureCaption(page, block.text, block.figureMetadata));
    }
  }
  flushTextRun();

  return chunks;
}
