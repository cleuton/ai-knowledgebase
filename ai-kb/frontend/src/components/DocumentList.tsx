import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listDocuments, deleteDocument, type DocumentSummary } from "../services/api.js";

const ACTIVE_STATUSES: DocumentSummary["status"][] = ["queued", "processing"];

export function DocumentList() {
  const queryClient = useQueryClient();

  const documentsQuery = useQuery({
    queryKey: ["documents"],
    queryFn: listDocuments,
    // Poll while anything is still in flight (research.md §10) so status
    // reaches the UI without the user refreshing (FR-004, SC-001).
    refetchInterval: (query) => {
      const documents = query.state.data ?? [];
      const hasActive = documents.some((d) => ACTIVE_STATUSES.includes(d.status));
      return hasActive ? 2000 : false;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  const documents = documentsQuery.data ?? [];

  return (
    <div className="panel">
      <h2>Documents</h2>
      {documentsQuery.isLoading && <p>Loading…</p>}
      {documentsQuery.isError && <p role="alert">{(documentsQuery.error as Error).message}</p>}
      {!documentsQuery.isLoading && documents.length === 0 && <p>No documents uploaded yet.</p>}
      <ul>
        {documents.map((doc) => (
          <li key={doc.id}>
            <span>{doc.filename}</span> — <strong>{doc.status}</strong>
            {doc.status === "failed" && doc.statusReason && <span> ({doc.statusReason})</span>}
            <button
              type="button"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (confirm(`Delete "${doc.filename}"? This removes it from the knowledge base.`)) {
                  deleteMutation.mutate(doc.id);
                }
              }}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
