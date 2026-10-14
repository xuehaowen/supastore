/** Limits actual body bytes and read time, independently of response headers. */
export function deadlineFetch(url: RequestInfo | URL, init: RequestInit = {}) {
  const deadline = AbortSignal.timeout(60000);
  return fetch(url, {
    ...init,
    signal: init.signal ? AbortSignal.any([init.signal, deadline]) : deadline,
  });
}
export async function boundedJson(
  response: Response,
  options: { maxBytes?: number; timeoutMs?: number } = {},
): Promise<unknown> {
  const maxBytes = options.maxBytes ?? 1048576;
  const timeoutMs = options.timeoutMs ?? 10000;
  const reader = response.body?.getReader();
  let complete = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function read() {
    if (Number(response.headers.get("content-length")) > maxBytes)
      throw new Error("Response is too large.");
    let bytes = 0,
      text = "";
    const decoder = new TextDecoder();
    while (reader) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) throw new Error("Response is too large.");
      text += decoder.decode(chunk.value, { stream: true });
    }
    complete = true;
    return JSON.parse(text + decoder.decode());
  }
  try {
    return await Promise.race([
      read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Response timed out.")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (!complete && reader) void reader.cancel().catch(() => {});
  }
}
