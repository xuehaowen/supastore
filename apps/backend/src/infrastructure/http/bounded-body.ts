export class BodyTooLargeError extends Error {}
export class BodyReadTimeoutError extends Error {}

/** Read actual bytes once, bounding allocation and read time regardless of headers. */
export async function readBoundedBody(
  body: ReadableStream<Uint8Array>,
  options: {
    maxBytes: number;
    contentLength?: string | null;
    timeoutMs?: number;
  },
): Promise<Uint8Array<ArrayBuffer>> {
  const { maxBytes, contentLength, timeoutMs = 10000 } = options;
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 0 ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0
  )
    throw new RangeError("Invalid body read limits.");
  if (
    contentLength &&
    (!/^\d+$/.test(contentLength) || Number(contentLength) > maxBytes)
  ) {
    void body.cancel().catch(() => {});
    throw new BodyTooLargeError("Body is too large.");
  }
  const reader = body.getReader();
  let complete = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function read() {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new BodyTooLargeError("Body is too large.");
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    complete = true;
    return bytes;
  }
  try {
    return await Promise.race([
      read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new BodyReadTimeoutError("Body read timed out.")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
    // Cancellation failures must not replace the original limit/source failure.
    // Do not await cancellation: an uncooperative source must not defeat the deadline.
    if (!complete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
