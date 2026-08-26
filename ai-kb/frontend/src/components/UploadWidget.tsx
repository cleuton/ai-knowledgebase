import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { uploadDocuments } from "../services/api.js";

export function UploadWidget() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: uploadDocuments,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  function handleFiles(fileList: FileList | null) {
    setClientError(null);
    mutation.reset();
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    const nonPdf = files.find(
      (f) => f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf"),
    );
    if (nonPdf) {
      setClientError(`"${nonPdf.name}" is not a PDF file — only PDF uploads are supported.`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    mutation.mutate(files);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="panel">
      <h2>Upload documents</h2>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        disabled={mutation.isPending}
        onChange={(e) => handleFiles(e.target.files)}
      />
      {mutation.isPending && <p>Uploading…</p>}
      {clientError && <p role="alert">{clientError}</p>}
      {mutation.isError && <p role="alert">{(mutation.error as Error).message}</p>}
    </div>
  );
}
