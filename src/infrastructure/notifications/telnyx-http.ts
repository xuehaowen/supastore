export const TELNYX_API_ORIGIN = "https://api.telnyx.com";
export async function discardTelnyxResponse(response: Response) {
  try {
    await response.body?.cancel();
  } catch {
    /* A known HTTP rejection remains definite even if cleanup fails. */
  }
}
export async function telnyxPost(
  path: string,
  apiKey: string,
  payload: Record<string, unknown>,
  fetcher: typeof fetch = fetch,
) {
  // All callers supply fixed endpoint paths or validated UUIDs; no caller URL is accepted.
  if (
    !/^\/v2\/(messages|verifications\/sms|verifications\/[0-9a-f-]{36}\/actions\/verify)$/i.test(
      path,
    )
  )
    throw new Error("Invalid notification endpoint.");
  return await fetcher(TELNYX_API_ORIGIN + path, {
    method: "POST",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
}
export async function telnyxData(
  response: Response,
): Promise<Record<string, unknown> | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        return null;
      }
      chunks.push(part.value);
    }
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
      data?: unknown;
    };
    return parsed.data &&
      typeof parsed.data === "object" &&
      !Array.isArray(parsed.data)
      ? (parsed.data as Record<string, unknown>)
      : null;
  } finally {
    reader.releaseLock();
  }
}
