import { afterEach, describe, expect, it, vi } from "vitest";
import { proxyBackendApi } from "./backend-proxy";
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("fixed backend API proxy", () => {
  it("forwards a client IP only from the authenticated edge and never forwards its credentials", async () => {
    const secret = "synthetic-edge-secret-at-least-32-characters";
    vi.stubEnv("EDGE_PROXY_SECRET", secret);
    vi.stubEnv("BACKEND_URL", "http://backend:3000");
    const seen: Headers[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
      seen.push(new Headers(options.headers));
      return new Response("ok");
    }));
    for (const token of [secret, "spoofed"]) {
      const response = await proxyBackendApi(new Request("https://shop.example/api/v1/store", { headers: {
        "x-supastore-edge-token": token,
        "x-supastore-client-ip": "192.0.2.1",
        "x-forwarded-for": "spoofed",
      } }));
      expect(await response.text()).toBe("ok");
    }
    expect(seen[0]!.get("x-forwarded-for")).toBe("192.0.2.1");
    expect(seen[1]!.get("x-forwarded-for")).toBeNull();
    for (const headers of seen) {
      expect(headers.get("x-supastore-edge-token")).toBeNull();
      expect(headers.get("x-supastore-client-ip")).toBeNull();
    }
  });
  it("preserves private cookies, exact webhook body and signature headers while dropping hop headers", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend:3000");
    vi.stubEnv("STOREFRONT_ORIGIN", "https://shop.example");
    const fetcher = vi.fn(async (url: URL, options: RequestInit) => {
      expect(url.href).toBe("http://backend:3000/api/payments/stripe/webhook?fixture=1");
      const headers = new Headers(options.headers);
      expect(headers.get("cookie")).toBe("proof=fixture");
      expect(headers.get("stripe-signature")).toBe("raw-signature");
      expect(headers.get("connection")).toBeNull();
      expect(headers.get("host")).toBeNull();
      expect(headers.get("x-forwarded-for")).toBeNull();
      expect(headers.get("x-real-ip")).toBeNull();
      expect(headers.get("x-forwarded-host")).toBe("shop.example");
      expect(headers.get("origin")).toBe("https://shop.example");
      expect(await new Response(options.body).text()).toBe('{"exact": true}\n');
      const responseHeaders = new Headers({ connection: "close, x-hop", "x-hop": "private", "content-encoding": "gzip", "content-length": "999" });
      responseHeaders.append("set-cookie", "a=one; HttpOnly; Path=/");
      responseHeaders.append("set-cookie", "b=two; HttpOnly; Path=/");
      return new Response("ok", { headers: responseHeaders });
    });
    vi.stubGlobal("fetch", fetcher);
    const response = await proxyBackendApi(new Request("https://shop.example/api/payments/stripe/webhook?fixture=1", {
      method: "POST", body: '{"exact": true}\n', headers: { cookie: "proof=fixture", "stripe-signature": "raw-signature", origin: "https://shop.example", connection: "close", host: "spoof.example", "x-forwarded-for": "spoof", "x-real-ip": "spoof", "x-forwarded-host": "spoof.example" },
    }));
    expect(await response.text()).toBe("ok");
    expect(response.headers.getSetCookie()).toHaveLength(2);
    for (const key of ["connection", "x-hop", "content-encoding", "content-length"]) expect(response.headers.get(key)).toBeNull();
  });
  it("keeps a hostile path on the configured backend origin and rejects paths outside API", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend:3000");
    const fetcher = vi.fn(async (url: URL) => { expect(url.origin).toBe("http://backend:3000"); return Response.json({}); });
    vi.stubGlobal("fetch", fetcher);
    expect((await proxyBackendApi(new Request("https://shop.example/api//evil.example/path"))).status).toBe(200);
    expect((await proxyBackendApi(new Request("https://shop.example/api/../admin"))).status).toBe(404);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("returns a private generic outage response without exposing upstream errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("sensitive upstream detail")));
    const response = await proxyBackendApi(new Request("https://shop.example/api/v1/store"));
    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).not.toContain("sensitive");
  });
  it("clears deadline resources after response completion and aborts when the client cancels", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
      signal = options.signal;
      return new Response("fixture");
    }));
    const response = await proxyBackendApi(new Request("https://shop.example/api/v1/store"));
    expect(await response.text()).toBe("fixture");
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(30001);
    expect(signal!.aborted).toBe(false);
    const client = new AbortController();
    vi.stubGlobal("fetch", vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    })));
    const pending = proxyBackendApi(new Request("https://shop.example/api/v1/store", { signal: client.signal }));
    client.abort();
    expect((await pending).status).toBe(502);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps the deadline active through an unfinished response body and cleans up on timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async (_url, options) => new Response(new ReadableStream({
      start(controller) { options.signal.addEventListener("abort", () => controller.error(new Error("deadline")), { once: true }); },
    }))));
    const response = await proxyBackendApi(new Request("https://shop.example/api/v1/store"));
    const body = expect(response.text()).rejects.toThrow("deadline");
    await vi.advanceTimersByTimeAsync(30001);
    await body;
    expect(vi.getTimerCount()).toBe(0);
  });
});
