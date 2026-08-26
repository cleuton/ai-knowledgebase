import type { FastifyInstance } from "fastify";
import { registerDocumentRoutes } from "./documents.js";
import { registerQueryRoutes } from "./query.js";

/** Central place route modules register themselves; extended as each user
 * story's routes are implemented (documents.ts in US1/US4, query.ts in US2). */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({ status: "ok" }));
  await registerDocumentRoutes(app);
  await registerQueryRoutes(app);
}
