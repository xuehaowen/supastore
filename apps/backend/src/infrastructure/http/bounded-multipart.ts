import { readBoundedBody } from "./bounded-body";
export { BodyTooLargeError as UploadTooLargeError } from "./bounded-body";

/** Bound actual network bytes before the multipart parser allocates file buffers. */
export async function readUploadForm(
  request: Request,
  maxBytes = 6 * 1024 * 1024,
) {
  if (!request.body) throw new Error("Multipart body required.");
  const bytes = await readBoundedBody(request.body, {
    maxBytes,
    contentLength: request.headers.get("content-length"),
    timeoutMs: 30000,
  });
  return new Response(bytes, {
    headers: { "content-type": request.headers.get("content-type") || "" },
  }).formData();
}
