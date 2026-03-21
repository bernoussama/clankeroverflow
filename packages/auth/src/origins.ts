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
