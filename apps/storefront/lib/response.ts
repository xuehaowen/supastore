function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function responseMessage(value: unknown, fallback: string) {
  if (!record(value)) return fallback;
  const message = record(value.error) ? value.error.message : value.message;
  return typeof message === "string" && message ? message : fallback;
}

export function responseData(value: unknown, wrapped: boolean): unknown {
  if (!record(value) || (wrapped && !("data" in value)))
    throw new Error("Invalid API response.");
  return wrapped ? value.data : value;
}
