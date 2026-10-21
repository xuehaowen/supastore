export class UploadTooLargeError extends Error {}

/** Bound actual network bytes before the multipart parser allocates file buffers. */
export async function readUploadForm(
  request: Request,
  maxBytes = 6 * 1024 * 1024,
) {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    await request.body?.cancel();
    throw new UploadTooLargeError("Upload exceeds request limit.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Multipart body required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new UploadTooLargeError("Upload exceeds request limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Response(bytes, {
    headers: { "content-type": request.headers.get("content-type") || "" },
  }).formData();
}
