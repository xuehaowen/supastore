import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseOptionalCartDto } from "../../../packages/contracts/src/index";
import { BackendApiError, readApi, readPublicApi } from "./api";
import { ApiError, request } from "./client";
vi.mock("next/headers", () => ({
  cookies: async () => ({ toString: () => "guest=test" }),
}));

const fetchMock = vi.fn();
const cart = { id: "cart", items: [], subtotalCents: 0 };
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("decoded storefront HTTP boundaries", () => {
  it("caches public catalog reads without forwarding customer cookies", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ data: { title: "Public catalog" } }),
    );
    await expect(
      readPublicApi("catalog?page=1", (value) => value),
    ).resolves.toEqual({ title: "Public catalog" });
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({
      cache: "force-cache",
      next: { revalidate: 30 },
    });
    expect(fetchMock.mock.calls[0]![1].headers).toBeUndefined();
  });
  it.each([
    "catalog?search=unique-customer-search",
    "catalog?page=2",
    "products/cup?unexpected=unique",
    "products/cup?locale=unexpected",
    "store?unique=anything",
  ])("keeps variable public queries uncached: %s", async (path) => {
    fetchMock.mockResolvedValue(
      Response.json({ data: { title: "Public catalog" } }),
    );
    await readPublicApi(path, (value) => value);
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ cache: "no-store" });
    expect(fetchMock.mock.calls[0]![1].headers).toBeUndefined();
  });
  it.each([
    "account",
    "cart",
    "orders/private",
    "products/..",
    "products/%2e%2e%2fcart",
  ])("refuses to cache private or malformed paths: %s", async (path) => {
    await expect(readPublicApi(path, (value) => value)).rejects.toMatchObject({
      status: 400,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("preserves bounded response request IDs in both typed error boundaries", async () => {
    fetchMock.mockImplementation(
      () =>
        new Response("Unauthorized", {
          status: 401,
          headers: { "x-request-id": "fixture-request-id" },
        }),
    );
    await expect(readApi("cart", parseOptionalCartDto)).rejects.toMatchObject({
      status: 401,
      requestId: "fixture-request-id",
    });
    await expect(request("v1/cart")).rejects.toMatchObject({
      status: 401,
      requestId: "fixture-request-id",
    });
    fetchMock.mockImplementation(
      () =>
        new Response("Unauthorized", {
          status: 401,
          headers: { "x-request-id": "x".repeat(65) },
        }),
    );
    await expect(request("v1/cart")).rejects.toMatchObject({
      status: 401,
      requestId: undefined,
    });
  });
  it("times out stalled requests and cancels the transport", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation((_url, init) => {
      signal = init.signal;
      return new Promise(() => {});
    });
    const pending = readApi("cart", parseOptionalCartDto);
    const assertion = expect(pending).rejects.toMatchObject({ status: 504 });
    await vi.advanceTimersByTimeAsync(15000);
    await assertion;
    expect(signal?.aborted).toBe(true);
  });
  it("bounds chunked response bodies and cancels oversized downloads", async () => {
    const cancelled = vi.fn();
    fetchMock.mockImplementation(
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
            },
            cancel: cancelled,
          }),
        ),
    );
    await expect(request("v1/cart")).rejects.toMatchObject({ status: 502 });
    expect(cancelled).toHaveBeenCalled();
  });
  it("rejects an oversized advertised body before reading it", async () => {
    const cancelled = vi.fn();
    fetchMock.mockImplementation(
      () =>
        new Response(new ReadableStream({ cancel: cancelled }), {
          headers: { "content-length": String(2 * 1024 * 1024 + 1) },
        }),
    );
    await expect(readApi("cart", parseOptionalCartDto)).rejects.toMatchObject({
      status: 502,
    });
    expect(cancelled).toHaveBeenCalled();
  });
  it("includes response-body reads in the deadline", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      () => new Response(new ReadableStream({ start() {} })),
    );
    const assertion = expect(request("v1/cart")).rejects.toMatchObject({
      status: 504,
    });
    await vi.advanceTimersByTimeAsync(15000);
    await assertion;
  });
  it("decodes server responses and forwards guest context", async () => {
    fetchMock.mockResolvedValue(Response.json({ data: cart }));
    await expect(readApi("cart", parseOptionalCartDto)).resolves.toEqual(cart);
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({
      headers: { cookie: "guest=test" },
      cache: "no-store",
    });
  });
  it.each([{}, { data: { ...cart, items: "invalid" } }, { data: undefined }])(
    "rejects invalid successful responses in both transports",
    async (body) => {
      fetchMock.mockImplementation(async () => Response.json(body));
      await expect(readApi("cart", parseOptionalCartDto)).rejects.toMatchObject(
        { status: 502 },
      );
      await expect(
        request("v1/cart", undefined, "GET", parseOptionalCartDto),
      ).rejects.toMatchObject({ status: 502 });
    },
  );
  it("allows a legitimate empty cart", async () => {
    fetchMock.mockImplementation(async () => Response.json({ data: null }));
    await expect(readApi("cart", parseOptionalCartDto)).resolves.toBeNull();
    await expect(
      request("v1/cart", undefined, "GET", parseOptionalCartDto),
    ).resolves.toBeNull();
  });
  it("preserves authorization errors even with a non-JSON upstream body", async () => {
    fetchMock.mockImplementation(
      async () => new Response("Unauthorized", { status: 401 }),
    );
    await expect(
      readApi("account", parseOptionalCartDto),
    ).rejects.toBeInstanceOf(BackendApiError);
    await expect(
      request("v1/account", undefined, "GET", parseOptionalCartDto),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("reports malformed JSON through the same typed error boundary", async () => {
    fetchMock.mockImplementation(async () => new Response("invalid JSON"));
    await expect(readApi("cart", parseOptionalCartDto)).rejects.toMatchObject({
      status: 502,
    });
    await expect(request("v1/cart")).rejects.toBeInstanceOf(ApiError);
  });
});
