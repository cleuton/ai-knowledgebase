import { getEnv } from "../../config/env.js";

const VOYAGE_EMBEDDINGS_URL = "https://api.voyageai.com/v1/embeddings";
const EMBEDDING_MODEL = "voyage-3";

interface VoyageEmbeddingsResponse {
  data: Array<{ embedding: number[]; index: number }>;
}

/** Batches text through Voyage AI's embeddings endpoint. Used for both chunk
 * indexing (`inputType: "document"`) and query embedding (`inputType: "query"`) —
 * Voyage's models are tuned differently for each side of a retrieval pair. */
export async function embedTexts(
  texts: string[],
  inputType: "document" | "query",
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const response = await fetch(VOYAGE_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getEnv().voyageApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: texts, model: EMBEDDING_MODEL, input_type: inputType }),
  });

  if (!response.ok) {
    throw new Error(`Voyage embeddings request failed (${response.status}): ${await response.text()}`);
  }

  const body = (await response.json()) as VoyageEmbeddingsResponse;
  return body.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export async function embedText(text: string, inputType: "document" | "query"): Promise<number[]> {
  const [embedding] = await embedTexts([text], inputType);
  if (!embedding) throw new Error("Voyage embeddings returned no result");
  return embedding;
}
