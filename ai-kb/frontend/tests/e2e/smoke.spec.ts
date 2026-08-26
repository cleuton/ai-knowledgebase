import { test, expect } from "@playwright/test";

// Proves the Playwright wiring declared in plan.md actually works (tasks.md
// T049). Only checks that the app shell renders — it deliberately doesn't
// depend on a running backend, since DocumentList/ChatPanel already degrade
// to their own error states (not a render crash) when API calls fail.
test("app shell renders with upload, document list, and chat panel", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Knowledge Base Search" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Upload documents" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Documents", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ask a question" })).toBeVisible();
});
