import { z } from "zod";

export const querySchema = z.object({
  question: z.string().trim().min(1, "question must be a non-empty string"),
});

export const documentIdParamSchema = z.object({
  documentId: z.string().uuid("documentId must be a UUID"),
});

/** Fastify's own generics give compile-time typing but not runtime
 * validation; this wraps a Zod schema into a small helper routes call at the
 * top of their handler, returning a 400 with the first validation issue on
 * failure rather than letting a malformed body reach business logic. */
export function parseOrBadRequest<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
): { success: true; data: z.infer<T> } | { success: false; message: string } {
  const result = schema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return { success: false, message: result.error.issues[0]?.message ?? "Invalid request" };
}
