import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { pages } from "../../../tests/fixtures/customer-pages";
import Catalog from "../app/catalog";
const state = vi.hoisted(() => ({
  image: "catalog/loaf.png",
  about: "Our small bakery's current collection.",
  latestName: "Fixture bakery",
}));
vi.mock("./page-data", () => ({
  readRequestPage: async (page: string) => ({
    ...pages.catalog,
    store: {
      ...pages.catalog.store,
      storeName: page === "layout" ? state.latestName : "Fixture bakery",
      publicContent: { en: { about: state.about } },
    },
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
  }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("../app/product-card", () => ({ ProductCard: () => null }));
beforeEach(() => {
  state.image = "catalog/loaf.png";
  state.about = "Our small bakery's current collection.";
  state.latestName = "Fixture bakery";
});
it("keeps hero branding current when the anonymous product catalog is cached", async () => {
  state.latestName = "Current bakery name";
  const html = renderToStaticMarkup(
    await Catalog({ locale: "en", showHero: true }),
  );
  expect(html).toContain("Current bakery name");
  expect(html).not.toContain("Fixture bakery");
});
it("uses the configured merchant identity and a real catalog image instead of decorative shapes", async () => {
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
