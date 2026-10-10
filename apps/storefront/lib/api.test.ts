import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseOptionalCartDto } from "../../../packages/contracts/src";
import { BackendApiError, readApi } from "./api";
import { ApiError, request } from "./client";
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ cookie: "guest=test" }),
}));

const fetchMock = vi.fn();
const cart = { id: "cart", items: [], subtotalCents: 0 };
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("decoded storefront HTTP boundaries", () => {
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
