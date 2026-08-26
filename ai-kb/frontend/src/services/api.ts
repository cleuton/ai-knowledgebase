export type DocumentStatus = "queued" | "processing" | "indexed" | "failed";

export interface DocumentSummary {
  id: string;
  filename: string;
  status: DocumentStatus;
  statusReason: string | null;
  pageCount: number | null;
  uploadedAt: string;
  indexedAt: string | null;
}

export interface Citation {
  documentId: string;
  documentFilename: string;
  page: number;
}

export interface QuestionAnswerExchange {
  question: string;
  answer: string;
  confident: boolean;
  citations: Citation[];
}

const API_BASE = "/api";

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

export async function uploadDocuments(files: File[]): Promise<DocumentSummary[]> {
  const form = new FormData();
  for (const file of files) form.append("files", file);

  const response = await fetch(`${API_BASE}/documents`, { method: "POST", body: form });
  if (!response.ok) throw new Error(await parseErrorMessage(response));
  const body = (await response.json()) as { documents: DocumentSummary[] };
  return body.documents;
}

export async function listDocuments(): Promise<DocumentSummary[]> {
  const response = await fetch(`${API_BASE}/documents`);
  if (!response.ok) throw new Error(await parseErrorMessage(response));
  const body = (await response.json()) as { documents: DocumentSummary[] };
  return body.documents;
}

export async function deleteDocument(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/documents/${id}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) throw new Error(await parseErrorMessage(response));
}

export async function askQuestion(question: string): Promise<QuestionAnswerExchange> {
  const response = await fetch(`${API_BASE}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!response.ok) throw new Error(await parseErrorMessage(response));
  return (await response.json()) as QuestionAnswerExchange;
}
