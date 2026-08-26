import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect } from "vitest";
import { UploadWidget } from "../../src/components/UploadWidget.js";

// Proves the Vitest + React Testing Library + jsdom wiring declared in
// plan.md's Testing stack actually works (tasks.md T049).
describe("UploadWidget", () => {
  it("renders a file input that accepts PDFs", () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <UploadWidget />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("heading", { name: "Upload documents" })).toBeInTheDocument();
    const input = screen.getByDisplayValue("") as HTMLInputElement;
    expect(input.type).toBe("file");
    expect(input.accept).toContain("application/pdf");
  });
});
