export function errorFields(error: unknown) {
  if (error instanceof Error) {
    return {
      error_type: error.name,
      error_message: error.message,
    };
  }

  return {
    error_type: typeof error,
    error_message: String(error),
  };
}

export function logError(event: Record<string, unknown>) {
  console.error(
    JSON.stringify({
      level: "error",
      service: "api",
      timestamp: new Date().toISOString(),
      ...event,
    }),
  );
}
