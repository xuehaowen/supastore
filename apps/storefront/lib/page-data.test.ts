import { beforeEach, describe, expect, it, vi } from "vitest";
import { readPage } from "./page-data";

const { readApi, readPublicApi, missingPage } = vi.hoisted(() => ({
  readApi: vi.fn(),
  readPublicApi: vi.fn(),
  missingPage: new Error("NEXT_NOT_FOUND"),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw missingPage;
  },
}));
vi.mock("./api", () => ({
  readApi,
  readPublicApi,
  BackendApiError: class extends Error {},
}));

beforeEach(() => {
  readApi.mockReset();
  readPublicApi.mockReset();
});

describe("storefront page locale boundary", () => {
  it.each(["favicon.ico", "robots.txt", "en_US", "fr", ""])(
    "rejects unsupported route locale %s before backend reads or formatting",
    async (locale) => {
      readApi.mockResolvedValue({
        result: {},
        facets: [],
        collections: [],
        groups: [],
      });
      await expect(readPage("catalog", locale)).rejects.toBe(missingPage);
      expect(readApi).not.toHaveBeenCalled();
      expect(readPublicApi).not.toHaveBeenCalled();
    },
  );

  it.each(["en", "zh"])("keeps supported locale %s", async (locale) => {
    const data = { result: {}, facets: [], collections: [], groups: [] };
    readPublicApi.mockResolvedValue(data);
    await expect(readPage("catalog", locale)).resolves.toEqual(data);
    expect(readPublicApi.mock.calls[0]?.[0]).toBe(
      `customer-pages/catalog?locale=${locale}`,
    );
  });
});
