import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { pages } from "../../../tests/fixtures/customer-pages";
import Product from "../app/[locale]/products/[handle]/page";
vi.mock("./page-data", () => ({
  readProductPage: async () => ({
    ...pages.product,
    availableQuantities: { variant: 0 },
  }),
}));
vi.mock("../app/product-purchase", () => ({ ProductPurchase: () => null }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
it("declares zero-stock offers out of stock in the same way as the purchase UI", async () => {
  const html = renderToStaticMarkup(
    await Product({
      params: Promise.resolve({ locale: "en", handle: "bread" }),
    }),
  );
  expect(html).toContain('"availability":"https://schema.org/OutOfStock"');
  expect(html).not.toContain('"availability":"https://schema.org/InStock"');
});
