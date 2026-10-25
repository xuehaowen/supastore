import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { pages } from "../../../tests/fixtures/customer-pages";
import Catalog from "../app/catalog";
const state = vi.hoisted(() => ({
  image: "catalog/loaf.png",
  about: "Our small bakery's current collection.",
  latestName: "Fixture bakery",
  featured: [] as string[],
  noCollections: false,
  read: vi.fn(),
}));
vi.mock("./page-data", () => ({
  readRequestPage: async (page: string, locale: string, query: unknown) => {
    state.read(page, locale, query);
    return {
      ...pages.catalog,
      store: {
        ...pages.catalog.store,
        storeName: page === "layout" ? state.latestName : "Fixture bakery",
        storefrontHero: {
          imageKey: state.image || null,
          en: { heading: "", body: "", imageAlt: "Morning loaf" },
          featuredCollectionIds: state.featured,
        },
        publicContent: { en: { about: state.about } },
      },
      collections: state.noCollections
        ? []
        : [
            {
              id: "home",
              handle: "at-home",
              title: "At home",
              description: "For home",
              imageKey: null,
            },
            {
              id: "out",
              handle: "outdoors",
              title: "Outdoors",
              description: "For outside",
              imageKey: null,
            },
          ],
      groups: [
        { id: "bakery", slug: "bakery", name: "Bakery", parentId: null },
      ],
      result: {
        ...pages.catalog.result,
        items: [
          {
            id: "loaf",
            handle: "loaf",
            title: "Morning loaf",
            coverImageKey: state.image,
            lowestPriceCents: 500,
          },
        ],
      },
    };
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("../app/product-card", () => ({ ProductCard: () => null }));
beforeEach(() => {
  state.image = "catalog/loaf.png";
  state.about = "Our small bakery's current collection.";
  state.latestName = "Fixture bakery";
  state.featured = [];
  state.noCollections = false;
  state.read.mockReset();
});
it("keeps a single homepage product grid and puts search/filter controls on the products page", async () => {
  const home = renderToStaticMarkup(
    await Catalog({ locale: "en", showHero: true }),
  );
  expect(home).toContain('href="#products"');
  expect(home).toContain("Latest products");
  expect(home).toContain('href="/en/search"');
  expect(home).not.toContain("catalog-category-nav");
  expect(home).not.toContain("catalog-collection-nav");
  expect(home).not.toContain("catalog-sort-form");
  expect(home).not.toContain("catalog-desktop-filters");
  expect(home).not.toContain("home-product-section");
  expect(state.read).toHaveBeenCalledTimes(2);
  const catalog = renderToStaticMarkup(await Catalog({ locale: "en" }));
  expect(catalog).toContain("catalog-sort-form");
  expect(catalog).toContain("catalog-desktop-filters");
});
it("localizes the simplified homepage labels", async () => {
  const html = renderToStaticMarkup(
    await Catalog({ locale: "zh", showHero: true }),
  );
  for (const label of ["立即选购", "选购全部商品", "最新商品"])
    expect(html).toContain(label);
});
it("keeps hero branding current when the anonymous product catalog is cached", async () => {
  state.latestName = "Current bakery name";
  const html = renderToStaticMarkup(
    await Catalog({ locale: "en", showHero: true }),
  );
  expect(html).toContain("Current bakery name");
  expect(html).not.toContain("Fixture bakery");
});
it("uses the configured merchant identity and deliberately selected hero photography", async () => {
  const html = renderToStaticMarkup(
    await Catalog({ locale: "en", showHero: true }),
  );
  expect(html).toContain("Fixture bakery");
  expect(html).toContain("Our small bakery&#x27;s current collection.");
  expect(decodeURIComponent(html)).toContain("catalog%2Floaf.png");
  expect(html).toContain("Morning loaf");
  expect(html).not.toContain("bg-[radial-gradient");
});
it("handles missing photography and long public copy without invented business details", async () => {
  state.image = "";
  state.about = "bread ".repeat(100);
  const html = renderToStaticMarkup(
    await Catalog({ locale: "zh", showHero: true }),
  );
  expect(html).not.toContain("catalog-hero-image");
  expect(html).not.toContain("bread ".repeat(60));
  expect(html).toContain("Fixture bakery");
});
