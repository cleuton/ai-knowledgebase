import { createCanvas, ImageData } from "@napi-rs/canvas";
import { OPS, type PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { MIN_IMAGE_SIZE_PX, MIN_IMAGE_AREA_FRACTION } from "../../config/constants.js";

export interface ExtractedImage {
  /** Page-space y-coordinate of the image's placement, for interleaving with
   * text blocks in reading order (matches TextBlock.y in pdfText.ts). */
  y: number;
  width: number;
  height: number;
  /** PNG-encoded image bytes. */
  buffer: Buffer;
}

// PDF.js ImageKind values (pdf.mjs does not export the enum from the Node
// entry point in a stable way across versions, so the numeric values — which
// are part of PDF.js's public, documented image-object contract — are
// inlined here rather than imported).
const IMAGE_KIND_GRAYSCALE_1BPP = 1;
const IMAGE_KIND_RGB_24BPP = 2;
const IMAGE_KIND_RGBA_32BPP = 3;

interface PdfImageObject {
  width: number;
  height: number;
  kind: number;
  data: Uint8ClampedArray;
}

function toRgba(image: PdfImageObject): Uint8ClampedArray {
  const { width, height, kind, data } = image;
  if (kind === IMAGE_KIND_RGBA_32BPP) return data;

  const rgba = new Uint8ClampedArray(width * height * 4);
  if (kind === IMAGE_KIND_RGB_24BPP) {
    for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
      rgba[j] = data[i] ?? 0;
      rgba[j + 1] = data[i + 1] ?? 0;
      rgba[j + 2] = data[i + 2] ?? 0;
      rgba[j + 3] = 255;
    }
    return rgba;
  }
  if (kind === IMAGE_KIND_GRAYSCALE_1BPP) {
    const bytesPerRow = Math.ceil(width / 8);
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const byte = data[row * bytesPerRow + (col >> 3)] ?? 0;
        const bit = (byte >> (7 - (col % 8))) & 1;
        const value = bit ? 255 : 0;
        const j = (row * width + col) * 4;
        rgba[j] = rgba[j + 1] = rgba[j + 2] = value;
        rgba[j + 3] = 255;
      }
    }
    return rgba;
  }
  throw new Error(`Unsupported PDF image kind: ${kind}`);
}

function encodePng(image: PdfImageObject): Buffer {
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  const imageData = new ImageData(toRgba(image), image.width, image.height);
  ctx.putImageData(imageData, 0, 0);
  return canvas.toBuffer("image/png");
}

/** Extracts every embedded raster image on a page via the operator list's
 * `paintImageXObject` calls, resolving each through `page.objs` (populated by
 * the time `getOperatorList()` resolves). Extraction failures are caught and
 * skipped per-image rather than failing the whole page — a single malformed
 * image shouldn't take down ingestion for the rest of the document. */
export async function extractPageImages(
  page: PDFPageProxy,
  pageNumber: number,
): Promise<ExtractedImage[]> {
  const operatorList = await page.getOperatorList();
  const images: ExtractedImage[] = [];

  for (let i = 0; i < operatorList.fnArray.length; i++) {
    if (operatorList.fnArray[i] !== OPS.paintImageXObject) continue;
    const args = operatorList.argsArray[i] as [string, ...unknown[]];
    const name = args[0];
    try {
      const imageObj = page.objs.get(name) as PdfImageObject | undefined;
      if (!imageObj?.data) continue;
      // Placement transform for this draw call isn't directly attached to
      // the operator args in a stable cross-version way; approximate the
      // block's vertical position with the page's natural top so it still
      // sorts sanely relative to text blocks. Refined once `transform`
      // (OPS.transform, which precedes paintImageXObject) is threaded
      // through — a known simplification for this MVP.
      const y = 0;
      images.push({ y, width: imageObj.width, height: imageObj.height, buffer: encodePng(imageObj) });
    } catch (err) {
      console.warn(`Skipping unreadable image "${name}" on page ${pageNumber}:`, err);
    }
  }
  return images;
}

/** True when an image is large enough to plausibly be a meaningful chart or
 * figure, rather than decorative art (icon/logo/rule) — spec.md Edge Cases,
 * User Story 3 Acceptance Scenario 3. */
export function isQualifyingImage(image: ExtractedImage, pageWidth: number, pageHeight: number): boolean {
  if (image.width < MIN_IMAGE_SIZE_PX || image.height < MIN_IMAGE_SIZE_PX) return false;
  const pageArea = pageWidth * pageHeight;
  if (pageArea <= 0) return true;
  const imageArea = image.width * image.height;
  return imageArea / pageArea >= MIN_IMAGE_AREA_FRACTION;
}
