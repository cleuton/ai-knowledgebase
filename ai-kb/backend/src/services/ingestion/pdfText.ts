// Node build of PDF.js — the Node runtime is auto-detected internally and the
// worker is disabled in-process, so no GlobalWorkerOptions.workerSrc wiring is
// needed (research.md §1).
import { getDocument, type PDFDocumentProxy, type PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

// Points PDF.js at its own bundled standard-font metrics and CJK CMaps so it
// doesn't warn (and degrade text-positioning accuracy) on PDFs using
// standard, non-embedded fonts or CJK encodings. Node's `fs.readFile` (used
// internally here — see NodeStandardFontDataFactory) takes plain paths, not
// `file://` URL strings, so `fileURLToPath` is required, not optional.
import { fileURLToPath } from "node:url";
const standardFontDataUrl = fileURLToPath(
  new URL("../../../node_modules/pdfjs-dist/standard_fonts/", import.meta.url),
);
const cMapUrl = fileURLToPath(new URL("../../../node_modules/pdfjs-dist/cmaps/", import.meta.url));

// pdf.d.mts doesn't re-export `TextItem` from its public entry point, so it's
// derived structurally from getTextContent()'s own return type instead.
type TextContentItem = Awaited<ReturnType<PDFPageProxy["getTextContent"]>>["items"][number];
type TextItem = Extract<TextContentItem, { str: string }>;

export interface TextBlock {
  /** Page-space y-coordinate (PDF convention: increases upward), used to
   * interleave text blocks with figure captions in reading order (US3). */
  y: number;
  text: string;
}

export interface PageText {
  page: number;
  blocks: TextBlock[];
}

const LINE_Y_TOLERANCE = 2;

/** Groups PDF.js text items into lines by y-proximity, then orders lines
 * top-to-bottom (descending y). Preserves reading order well enough for the
 * mostly single-column technical PDFs this MVP targets (FR-003); complex
 * multi-column layouts are a known limitation. */
function groupIntoLines(items: TextItem[]): TextBlock[] {
  const sorted = [...items].sort((a, b) => (b.transform[5] ?? 0) - (a.transform[5] ?? 0));
  const lines: TextBlock[] = [];
  for (const item of sorted) {
    const y = item.transform[5] ?? 0;
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - y) <= LINE_Y_TOLERANCE) {
      last.text += (last.text.endsWith(" ") || item.str.startsWith(" ") ? "" : " ") + item.str;
    } else {
      lines.push({ y, text: item.str });
    }
  }
  return lines.filter((l) => l.text.trim().length > 0);
}

export async function loadPdf(data: Buffer): Promise<PDFDocumentProxy> {
  const task = getDocument({ data: new Uint8Array(data), standardFontDataUrl, cMapUrl, cMapPacked: true });
  return task.promise;
}

export async function extractPageText(page: PDFPageProxy): Promise<TextBlock[]> {
  const content = await page.getTextContent();
  const items = content.items.filter((item): item is TextItem => "str" in item);
  return groupIntoLines(items);
}

/** Extracts per-page text for every page in the document, preserving page
 * number (1-indexed) and reading order per FR-003. */
export async function extractDocumentText(pdf: PDFDocumentProxy): Promise<PageText[]> {
  const pages: PageText[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    try {
      const blocks = await extractPageText(page);
      pages.push({ page: pageNumber, blocks });
    } finally {
      page.cleanup();
    }
  }
  return pages;
}
