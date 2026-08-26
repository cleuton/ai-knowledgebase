import { describe, it, expect } from "vitest";
import { loadPdf, extractPageText } from "../../src/services/ingestion/pdfText.js";

// A hand-built minimal single-page PDF ("Hello World" in Helvetica) — proves
// the pdfjs-dist Node (legacy build, worker auto-disabled) integration
// actually parses a real PDF, which is the highest-risk, least-verifiable
// piece of this codebase without a real sample-PDF fixture library.
const MINIMAL_PDF = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length 55 >>
stream
BT /F1 18 Tf 10 50 Td (Hello World) Tj ET
endstream
endobj
xref
0 6
0000000000 65535 f
trailer
<< /Size 6 /Root 1 0 R >>
startxref
0
%%EOF`;

describe("pdfText (pdfjs-dist Node integration)", () => {
  it("extracts text from a real PDF", async () => {
    const pdf = await loadPdf(Buffer.from(MINIMAL_PDF, "latin1"));
    expect(pdf.numPages).toBe(1);

    const page = await pdf.getPage(1);
    const blocks = await extractPageText(page);
    page.cleanup();

    expect(blocks.map((b) => b.text).join(" ")).toContain("Hello World");
  });
});
