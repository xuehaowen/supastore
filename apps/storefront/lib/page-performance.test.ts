import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readPage } from "./page-data";
import { pages } from "../../../tests/fixtures/customer-pages";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ cookie: "session=private-customer" }),
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation((url: string) => {
    const page = new URL(url).pathname.split("/").at(-1)! as keyof typeof pages;
    return Response.json({ data: pages[page] });
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("page-level caching and customer isolation", () => {
  it("maps malformed nested page data to the existing safe HTTP failure", async () => {
    fetchMock.mockImplementation(() =>
      Response.json(
        { data: { ...pages.product, availableQuantities: { variant: -1 } } },
        { headers: { "x-request-id": "contract-fixture" } },
      ),
    );
    await expect(
      readPage("product", "en", { handle: "bread" }),
    ).rejects.toMatchObject({
      status: 502,
      message: "Invalid API response.",
      requestId: "contract-fixture",
    });
  });

  it.each(["en", "zh"])(
    "reuses the common %s catalog without customer cookies",
    async (locale) => {
      await readPage("catalog", locale);
      expect(fetchMock.mock.calls[0]![1]).toMatchObject({
        cache: "force-cache",
        next: { revalidate: 30 },
      });
      expect(fetchMock.mock.calls[0]![1].headers).toBeUndefined();
    },
  );
  it.each([
    { q: "unique search" },
    { category: "cups" },
    { page: "2" },
    { options: ["size:M"] },
    { sort: "price-low" },
    { unexpected: "value" },
  ])(
    "does not fill the cache with variable catalog queries: %j",
    async (query) => {
      await readPage("catalog", "en", query);
      expect(fetchMock.mock.calls[0]![1].cache).toBe("no-store");
      expect(fetchMock.mock.calls[0]![1].headers).toBeUndefined();
    },
  );
  it.each(["layout", "cart", "checkout", "account", "product"] as const)(
    "keeps %s and live stock uncached with request identity",
    async (page) => {
      await readPage(page, "en");
      expect(fetchMock.mock.calls[0]![1]).toMatchObject({
        cache: "no-store",
        headers: { cookie: "session=private-customer" },
      });
    },
  );
});
