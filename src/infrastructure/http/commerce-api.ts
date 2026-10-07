import { DomainError, ForbiddenError } from "@/application/common/errors";
import { ValiError } from "valibot";

export function assertMutationOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const allowed = [
    new URL(request.url).origin,
    process.env.STOREFRONT_ORIGIN,
    process.env.BETTER_AUTH_URL,
  ].filter(Boolean);
  if (
    !origin ||
    !allowed.includes(origin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new ForbiddenError("Untrusted request origin.");
}

export async function readApiBody(
  request: Request,
): Promise<Record<string, unknown>> {
  assertMutationOrigin(request);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new DomainError("JSON body required.");
  // Bound actual bytes as well as Content-Length, including chunked requests.
  const reader = request.body?.getReader();
  if (!reader) throw new DomainError("JSON body required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > 32768) {
      await reader.cancel();
      throw new DomainError("Request is too large.");
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new DomainError("Invalid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new DomainError("JSON object required.");
  return value as Record<string, unknown>;
}

export function apiText(
  body: Record<string, unknown>,
  key: string,
  max = 200,
  optional = false,
) {
  const value = body[key];
  if (optional && value === undefined) return "";
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!optional && !value.trim())
  )
    throw new DomainError(`Invalid ${key}.`);
  return value.trim();
}
export function apiInteger(
  body: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
  fallback?: number,
) {
  const value = body[key] === undefined ? fallback : body[key];
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    throw new DomainError(`Invalid ${key}.`);
  return value;
}
export async function apiResponse(
  work: () => Promise<unknown>,
  publicCache = false,
) {
  const requestId = crypto.randomUUID();
  const headers = {
    "Cache-Control": publicCache ? "public, max-age=30" : "private, no-store",
    "X-Request-ID": requestId,
  };
  try {
    return Response.json({ data: await work(), requestId }, { headers });
  } catch (error) {
    const known = error instanceof DomainError || error instanceof ValiError;
    const code =
      error instanceof DomainError
        ? error.code
        : known
          ? "INVALID_INPUT"
          : "INTERNAL_ERROR";
    const status =
      code === "UNAUTHORIZED"
        ? 401
        : code === "FORBIDDEN"
          ? 403
          : code === "NOT_FOUND"
            ? 404
            : code === "CONFLICT"
              ? 409
              : known
                ? 400
                : 500;
    if (!known) console.error("Commerce API failure", { requestId, error });
    return Response.json(
      {
        error: {
          code,
          message: known ? error.message : "Unable to complete request.",
        },
        requestId,
      },
      { status, headers },
    );
  }
}
