const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEADLINE_MS = 15000;

export class TransportError extends Error {
  constructor(
    message: string,
    public status: number,
    public requestId?: string,
  ) {
    super(message);
  }
}

/** The same deadline covers connection, headers and the entire bounded body. */
export async function fetchJson(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let complete = false;
  let requestId: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(
        new TransportError(
          "Request timed out. Please try again.",
          504,
          requestId,
        ),
      );
    }, DEADLINE_MS);
  });
  async function read() {
    const response = await fetch(url, {
      ...init,
      signal: init.signal
        ? AbortSignal.any([init.signal, controller.signal])
        : controller.signal,
    });
    const correlation = response.headers.get("x-request-id");
    requestId =
      correlation && /^[A-Za-z0-9_-]{1,64}$/.test(correlation)
        ? correlation
        : undefined;
    reader = response.body?.getReader();
    if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES)
      throw new TransportError(
        "Response is too large.",
        response.ok ? 502 : response.status,
        requestId,
      );
    const decoder = new TextDecoder();
    let text = "";
    let bytes = 0;
    while (reader) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES)
        throw new TransportError(
          "Response is too large.",
          response.ok ? 502 : response.status,
          requestId,
        );
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    complete = true;
    let data: unknown = null;
    try {
      data = JSON.parse(text);
    } catch {
      /* The caller retains HTTP status for non-JSON errors. */
    }
    return { response, data, requestId };
  }
  try {
    return await Promise.race([read(), deadline]);
  } catch (error) {
    if (error instanceof TransportError) throw error;
    // Abort may reject fetch synchronously before the deadline promise wins.
    if (controller.signal.aborted)
      throw new TransportError(
        "Request timed out. Please try again.",
        504,
        requestId,
      );
    throw new TransportError(
      "Unable to reach the store. Please try again.",
      502,
      requestId,
    );
  } finally {
    clearTimeout(timer);
    if (!complete) {
      controller.abort();
      // Cancellation must not delay the bounded request if the source is stalled.
      void reader?.cancel().catch(() => {});
    }
  }
}
