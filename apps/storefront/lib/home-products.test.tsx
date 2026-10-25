import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { pages } from "../../../tests/fixtures/customer-pages";
import { HomeProducts } from "../app/home-products";
vi.mock("../app/product-card", () => ({
  ProductCard: ({ product }: { product: { title: string } }) => (
    <article>{product.title}</article>
  ),
}));
const product = {
  id: "chosen",
  handle: "chosen",
  title: "Chosen product",
  description: "",
  isPublished: true,
  variantCount: 1,
  coverImageKey: null,
  lowestPriceCents: 500,
};
it("shows the selected product result without collection or category sections", () => {
  const html = renderToStaticMarkup(
    HomeProducts({
      locale: "en",
      catalog: {
        ...pages.catalog,
        store: {
          ...pages.catalog.store,
          storefrontHero: { imageKey: null, featuredProductIds: [product.id] },
        },
        result: { ...pages.catalog.result, items: [product] },
      },
    }),
  );
  expect(html).toContain("Selected products");
  expect(html).toContain("Chosen product");
  expect(html).toContain('href="/en/search"');
  expect(html).not.toContain("/collections/");
  expect(html).not.toContain("?category=");
});
it("labels the latest fallback when previous selections are no longer published", () => {
  const html = renderToStaticMarkup(
    HomeProducts({
      locale: "en",
      catalog: {
        ...pages.catalog,
        store: {
          ...pages.catalog.store,
          storefrontHero: {
            imageKey: null,
            featuredProductIds: ["unpublished"],
          },
        },
        result: { ...pages.catalog.result, items: [product] },
      },
    }),
  );
  expect(html).toContain("Latest products");
  expect(html).not.toContain("Selected products");
});
it("shows a localized empty state", () => {
  const html = renderToStaticMarkup(
    HomeProducts({ locale: "en", catalog: pages.catalog }),
  );
  expect(html).toContain("No products");
});
