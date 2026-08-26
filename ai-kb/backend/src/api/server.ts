import "dotenv/config";
import Fastify, { type FastifyError } from "fastify";
import multipart from "@fastify/multipart";
import { getEnv } from "../config/env.js";
import { registerRoutes } from "./routes/index.js";
import { getQueue } from "../jobs/queue.js";
import { registerIngestionWorker } from "../jobs/ingestionJob.js";

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      transport:
        process.env.NODE_ENV === "production"
          ? undefined
          : { target: "pino-pretty", options: { colorize: true } },
    },
  });

  await app.register(multipart, {
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB per file — generous for MVP PDFs
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error({ err: error }, "request failed");
    const statusCode = error.statusCode ?? 500;
    reply.status(statusCode).send({ message: error.message || "Internal Server Error" });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ message: "Not Found" });
  });

  await registerRoutes(app);

  return app;
}

async function start(): Promise<void> {
  const app = await buildServer();
  const { port } = getEnv();
  try {
    // The ingestion worker runs in-process with the API for this MVP (no
    // separate worker deployment) — pg-boss polls the same Postgres instance
    // the API talks to, so no additional infra is introduced (research.md §2).
    const boss = await getQueue();
    await registerIngestionWorker(boss);

    await app.listen({ port, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Only auto-start when run directly (not when imported by tests).
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  void start();
}
