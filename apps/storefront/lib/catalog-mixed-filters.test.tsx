import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { pages } from "../../../tests/fixtures/customer-pages";
import Catalog from "../app/catalog";
import { CatalogFilters } from "../app/catalog-filters";
import { CatalogSort } from "../app/catalog-sort";

const state = vi.hoisted(() => ({ empty: false, read: vi.fn() }));
vi.mock("./page-data", () => ({
  readRequestPage: async (...args: unknown[]) => {
    state.read(...args);
    return {
      ...pages.catalog,
      collections: [
        {
          ...pages.catalog.collections[0],
          description: "A seasonal bread edit",
          imageKey: "catalog/bread.jpg",
        },
      ],
      groups: [
        {
          id: "category",
          name: "Loaves",
          slug: "loaves",
          parentId: null,
          sortOrder: 0,
          depth: 0,
        },
      ],
      result: {
        ...pages.catalog.result,
        total: state.empty ? 0 : 25,
        items: [],
        pageSize: 24,
      },
    };
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("../app/product-card", () => ({ ProductCard: () => null }));
beforeEach(() => {
  state.empty = false;
  state.read.mockReset();
});

it("offers a collection selector without requiring variant facets", () => {
  const html = renderToStaticMarkup(
    createElement(CatalogFilters, {
      locale: "en",
      facets: [],
      selected: [],
      query: "bread",
      sort: "recommended",
      category: "loaves",
      collection: "bread",
      collections: [{ handle: "bread", title: "Bread" }],
      categories: [{ slug: "loaves", name: "Loaves" }],
    }),
  );
  expect(html).toContain('name="collection"');
  expect(html).toContain('value="bread" selected=""');
  expect(html).toContain("All collections");
  expect(html).toContain("Filters (2)");
  expect(html).toContain('name="category" value="loaves"');
});
it("keeps sort submissions within the collection and provides recommended ordering", () => {
  const html = renderToStaticMarkup(
    createElement(CatalogSort, {
      locale: "en",
      query: {
        collectionPage: true,
        collection: "bread",
        category: "loaves",
        q: "bread",
        options: ["color:blue"],
      },
    }),
  );
  expect(html).toContain('action="/en/collections/bread"');
  expect(html).toContain('value="recommended" selected=""');
  expect(html).toContain('name="category" value="loaves"');
  expect(html).toContain('name="q" value="bread"');
  expect(html).toContain('name="options" value="color:blue"');
});
it("preserves collection editorial content, mixed filters and pagination on the shared catalog", async () => {
  const query = {
    collection: "bread",
    category: "loaves",
    q: "sourdough",
    sort: "price-low",
    options: ["color:blue"],
  };
  const html = renderToStaticMarkup(
    await Catalog({ locale: "en", collectionPage: true, query }),
  );
  expect(state.read).toHaveBeenCalledWith("catalog", "en", {
    ...query,
    home: undefined,
  });
  expect(html).toContain("A seasonal bread edit");
  expect(decodeURIComponent(html)).toContain("catalog%2Fbread.jpg");
  expect(html).toContain('action="/en/collections/bread"');
  expect(html).toContain(
    "/en/collections/bread?q=sourdough&amp;sort=price-low&amp;options=color%3Ablue",
  );
  expect(html).toContain(
    "/en/collections/bread?page=2&amp;q=sourdough&amp;category=loaves&amp;sort=price-low&amp;options=color%3Ablue",
  );
  expect(html).not.toContain('name="collection"');
});
it("shows a removable collection chip in search and preserves scope in empty-result recovery", async () => {
  const mixed = renderToStaticMarkup(
    await Catalog({
      locale: "en",
      query: { collection: "bread", category: "loaves", q: "bread" },
    }),
  );
  expect(mixed).toContain("/en/search?q=bread&amp;category=loaves");
  expect(mixed).toContain('name="collection" value="bread"');
  state.empty = true;
  const empty = renderToStaticMarkup(
    await Catalog({
      locale: "en",
      collectionPage: true,
      query: { collection: "bread", category: "loaves", q: "unfindable" },
    }),
  );
  expect(empty).toContain(
    'href="/en/collections/bread?q=unfindable">Remove category',
  );
  expect(empty).toContain("/en/collections/bread?category=loaves");
});
