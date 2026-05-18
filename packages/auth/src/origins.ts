function normalizeOrigin(origin: string) {
  let parsedOrigin: URL;

  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new Error(`Invalid origin: ${origin}`);
  }

  if (!["http:", "https:"].includes(parsedOrigin.protocol)) {
    throw new Error(`Invalid origin: ${origin}`);
  }

  if (
    parsedOrigin.username ||
    parsedOrigin.password ||
    (parsedOrigin.pathname && parsedOrigin.pathname !== "/") ||
    parsedOrigin.search ||
    parsedOrigin.hash
  ) {
    throw new Error(`Invalid origin: ${origin}`);
  }

  return parsedOrigin.origin;
}

export function parseAllowedOrigins(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
        .map(normalizeOrigin),
    ),
  );
}

/** Default web origins for local split-origin dev (Next :3001 → API :3000). */
export const LOCAL_SPLIT_ORIGIN_DEV_FALLBACK =
  "http://localhost:3001,http://127.0.0.1:3001,http://[::1]:3001";

export type WorkerOriginBindings = {
  CORS_ORIGIN?: string;
  BETTER_AUTH_URL?: string;
};

/**
 * Resolves CORS/trusted origins from Worker bindings. Uses a localhost web-origin
 * fallback when `CORS_ORIGIN` is missing but `BETTER_AUTH_URL` looks like local dev,
 * so Miniflare still echoes `Access-Control-Allow-Origin` for split-origin local dev.
 */
export function parseAllowedOriginsWithDevFallback(
  bindings: WorkerOriginBindings | undefined,
): string[] {
  const raw = bindings?.CORS_ORIGIN?.trim();
  if (raw) return parseAllowedOrigins(raw);

  const authUrl = bindings?.BETTER_AUTH_URL ?? "";
  const looksLocal =
    authUrl.includes("localhost") ||
    authUrl.includes("127.0.0.1") ||
    authUrl.includes("[::1]");
  if (looksLocal) {
    return parseAllowedOrigins(LOCAL_SPLIT_ORIGIN_DEV_FALLBACK);
  }

  return [];
}
