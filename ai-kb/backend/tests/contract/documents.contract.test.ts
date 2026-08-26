import { describe, it, expect, beforeAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../src/api/server.js";

function buildMultipartBody(filename: string, content: string, contentType: string) {
  const boundary = "----kb-search-test-boundary";
  const body =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="files"; filename="${filename}"\r\n` +
    `Content-Type: ${contentType}\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--\r\n`;
  return { body: Buffer.from(body), contentType: `multipart/form-data; boundary=${boundary}` };
}

// Proves the Vitest + Fastify contract-test wiring declared in plan.md
// actually works (tasks.md T049) — this specific case (rejecting a non-PDF
// upload, FR-002) never touches Postgres, so it runs without live
// infrastructure, unlike most of this app's behavior.
describe("POST /documents contract", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
  });

  it("rejects a non-PDF upload with 400 before touching storage", async () => {
    const { body, contentType } = buildMultipartBody("notes.txt", "hello world", "text/plain");

    const response = await app.inject({
      method: "POST",
      url: "/documents",
      headers: { "content-type": contentType },
      payload: body,
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toContain("not a PDF");
  });
});
