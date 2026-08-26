function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export interface Env {
  readonly port: number;
  readonly databaseUrl: string;
  readonly anthropicApiKey: string;
  readonly voyageApiKey: string;
}

let cachedEnv: Env | undefined;

/** Loaded lazily so tests can set process.env before first access. */
export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;
  cachedEnv = {
    port: Number(process.env.PORT ?? 3000),
    databaseUrl: required("DATABASE_URL"),
    anthropicApiKey: required("ANTHROPIC_API_KEY"),
    voyageApiKey: required("VOYAGE_API_KEY"),
  };
  return cachedEnv;
}
