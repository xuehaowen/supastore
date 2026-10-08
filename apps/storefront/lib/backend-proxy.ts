import { trustedEdgeClientIP } from "./trusted-edge-ip";
const hopHeaders = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
];
function cleanHeaders(source: Headers) {
  const result = new Headers(source);
  for (const nominated of (source.get("connection") || "").split(","))
    if (nominated.trim()) result.delete(nominated.trim());
  for (const name of hopHeaders) result.delete(name);
  return result;
}
export async function proxyBackendApi(request: Request) {
  const backend = new URL(process.env.BACKEND_URL || "http://127.0.0.1:3000");
  if (
    !["http:", "https:"].includes(backend.protocol) ||
    backend.username ||
    backend.password ||
    backend.pathname !== "/" ||
    backend.search ||
    backend.hash
  )
    throw new Error("BACKEND_URL must be an HTTP origin");
  const incoming = new URL(request.url);
  if (!incoming.pathname.startsWith("/api/"))
    return new Response(null, { status: 404 });
  const target = new URL(backend.origin);
  target.pathname = incoming.pathname;
  target.search = incoming.search;
  const headers = cleanHeaders(request.headers);
  const clientIP = trustedEdgeClientIP(headers);
  for (const name of [...headers.keys()])
    if (
      name.startsWith("x-forwarded-") ||
      [
        "forwarded",
        "x-real-ip",
        "x-client-ip",
        "true-client-ip",
        "cf-connecting-ip",
      ].includes(name)
    )
      headers.delete(name);
  headers.delete("x-supastore-edge-token");
  headers.delete("x-supastore-client-ip");
  if (clientIP) headers.set("x-forwarded-for", clientIP);
  const publicOrigin = new URL(
    process.env.STOREFRONT_ORIGIN || incoming.origin,
  );
  headers.set("x-forwarded-host", publicOrigin.host);
  headers.set("x-forwarded-proto", publicOrigin.protocol.slice(0, -1));
  const cancellation = new AbortController();
  const abortClient = () => cancellation.abort();
  request.signal.addEventListener("abort", abortClient, { once: true });
  if (request.signal.aborted) cancellation.abort();
  const deadline = setTimeout(() => cancellation.abort(), 30000);
  const cleanup = () => {
    clearTimeout(deadline);
    request.signal.removeEventListener("abort", abortClient);
  };
  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      ...(request.method === "GET" || request.method === "HEAD"
        ? {}
        : { body: request.body, duplex: "half" }),
      redirect: "manual",
      cache: "no-store",
      signal: cancellation.signal,
    } as RequestInit);
    const responseHeaders = cleanHeaders(upstream.headers);
    // Fetch decodes compressed bodies; retain neither the original encoding nor its length.
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("content-length");
    responseHeaders.delete("set-cookie");
    for (const cookie of upstream.headers.getSetCookie())
      responseHeaders.append("set-cookie", cookie);
    if (!upstream.body) {
      cleanup();
      return new Response(null, {
        status: upstream.status,
        headers: responseHeaders,
      });
    }
    const reader = upstream.body.getReader();
    const body = new ReadableStream({
      async pull(controller) {
        try {
          const part = await reader.read();
          if (part.done) {
            cleanup();
            reader.releaseLock();
            controller.close();
          } else controller.enqueue(part.value);
        } catch (error) {
          cleanup();
          reader.releaseLock();
          controller.error(error);
        }
      },
      async cancel(reason) {
        cancellation.abort();
        cleanup();
        try {
          await reader.cancel(reason);
        } finally {
          reader.releaseLock();
        }
      },
    });
    return new Response(body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    cleanup();
    return Response.json(
      {
        error: {
          code: "BACKEND_UNAVAILABLE",
          message: "Store temporarily unavailable.",
        },
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
