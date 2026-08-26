import pino from "pino";

/** Structured logger shared by the API process and the ingestion worker.
 * Pretty-printed in development; plain JSON (the pino default) elsewhere so
 * log aggregators can parse it. */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport:
    process.env.NODE_ENV === "production"
      ? undefined
      : { target: "pino-pretty", options: { colorize: true } },
});

/** Logs a stage's duration in milliseconds, used across ingestion and query
 * pipelines to verify SC-002's ~5s end-to-end latency budget. */
export function logStageLatency(stage: string, startedAtMs: number, context: object = {}): void {
  logger.info({ stage, durationMs: Date.now() - startedAtMs, ...context }, `${stage} completed`);
}
