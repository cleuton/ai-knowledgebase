import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { askQuestion, type QuestionAnswerExchange } from "../services/api.js";

export function ChatPanel() {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<QuestionAnswerExchange[]>([]);

  const mutation = useMutation({
    mutationFn: askQuestion,
    onSuccess: (exchange) => setHistory((prev) => [...prev, exchange]),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || mutation.isPending) return;
    mutation.mutate(trimmed);
    setQuestion("");
  }

  return (
    <div className="panel">
      <h2>Ask a question</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask something about your documents…"
          disabled={mutation.isPending}
          style={{ width: "70%" }}
        />
        <button type="submit" disabled={mutation.isPending || question.trim().length === 0}>
          {mutation.isPending ? "Asking…" : "Ask"}
        </button>
      </form>

      {mutation.isError && <p role="alert">{(mutation.error as Error).message}</p>}

      <ul>
        {history.map((exchange, i) => (
          <li key={i}>
            <p>
              <strong>Q:</strong> {exchange.question}
            </p>
            <p>
              <strong>A:</strong> {exchange.answer}
            </p>
            {exchange.confident && exchange.citations.length > 0 && (
              <ul>
                {exchange.citations.map((c, j) => (
                  <li key={j}>
                    {c.documentFilename}, p. {c.page}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
