import type { FigureMetadata } from "../../models/types.js";
import type { TextBlock } from "./pdfText.js";
import { isQualifyingImage, type ExtractedImage } from "./pdfImages.js";
import { captionImage } from "./imageCaptioning.js";

export interface AssembledBlock {
  y: number;
  text: string;
  chunkType: "text" | "figure";
  figureMetadata?: FigureMetadata;
}

/** Merges a page's text blocks with its captioned figures into one ordered
 * block stream, so figures flow into chunking at their original position
 * like any other text (FR-007, constitution Principle III). Only images
 * that clear the minimum-size/area threshold are captioned at all — smaller
 * ones are assumed decorative and dropped (spec.md Edge Cases, User Story 3
 * Acceptance Scenario 3). A captioning failure for one image is logged and
 * skipped rather than failing the whole page (spec.md Edge Cases).
 *
 * Known MVP limitation: image y-position isn't yet threaded through from the
 * operator list's placement transform (see pdfImages.ts), so figure blocks
 * sort after a page's text blocks rather than at their exact original
 * position — an accepted simplification, not a silent data-loss bug. */
export async function assemblePageBlocks(
  pageNumber: number,
  textBlocks: TextBlock[],
  images: ExtractedImage[],
  pageWidth: number,
  pageHeight: number,
): Promise<AssembledBlock[]> {
  const textAsBlocks: AssembledBlock[] = textBlocks.map((b) => ({
    y: b.y,
    text: b.text,
    chunkType: "text",
  }));

  const figureBlocks: AssembledBlock[] = [];
  for (const image of images) {
    if (!isQualifyingImage(image, pageWidth, pageHeight)) continue;
    try {
      const caption = await captionImage(image);
      if (!caption) continue;
      figureBlocks.push({
        y: image.y,
        text: `[FIGURE: ${caption.summary}]`,
        chunkType: "figure",
        figureMetadata: caption.metadata,
      });
    } catch (err) {
      console.warn(`Skipping caption for an image on page ${pageNumber}:`, err);
    }
  }

  return [...textAsBlocks, ...figureBlocks].sort((a, b) => b.y - a.y);
}
