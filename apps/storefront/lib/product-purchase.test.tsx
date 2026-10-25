import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductPurchase } from "../app/product-purchase";
import { pages } from "../../../tests/fixtures/customer-pages";
vi.mock("../app/actions", () => ({ addItem: vi.fn() }));
const props = {
  locale: "en",
  currency: "USD",
  precision: 2,
  labels: {
    quantity: "Quantity",
    add: "Add to bag",
    unavailable: "Unavailable",
  },
};
it("keeps the labeled base price visible before optional shopping context is selected", () => {
  const html = renderToStaticMarkup(
    <ProductPurchase
      {...props}
      product={pages.product.purchasable}
      hasContextualRules
    />,
  );
  expect(html).toContain("$5.00");
  expect(html).toContain("Base price; options may change price");
});
it("disables a zero-stock variant rather than offering a failed add to cart", () => {
  const html = renderToStaticMarkup(
    <ProductPurchase
      {...props}
      product={pages.product.purchasable}
      availableQuantities={{ variant: 0 }}
    />,
  );
  expect(html).toMatch(/type="submit"[^>]*disabled=""/);
  expect(html).not.toContain("Add to bag");
});
it("previews an in-stock variant but requires an explicit multi-variant choice", () => {
  const product = {
    ...pages.product.purchasable,
    variants: [
      ...pages.product.purchasable.variants,
      {
        ...pages.product.purchasable.variants[0]!,
        id: "in-stock",
        title: "Available loaf",
      },
    ],
  };
  const html = renderToStaticMarkup(
    <ProductPurchase
      {...props}
      product={product}
      availableQuantities={{ variant: 0, "in-stock": 3 }}
    />,
  );
  expect(html).toMatch(/name="variantId"[^>]*value=""/);
  expect(html).toContain("Available quantity: 3");
  expect(html).toContain("Choose options");
  expect(html).not.toContain("Add to bag");
});

it("only offers the full description disclosure when there is more to read", () => {
  for (const [description, disclosure] of [
    ["Soft cotton.", false],
    ["😀".repeat(180), false],
    ["😀".repeat(181), true],
  ] as const) {
    const html = renderToStaticMarkup(
      <ProductPurchase
        {...props}
        product={{ ...pages.product.purchasable, description }}
      />,
    );
    expect(html.includes('<details class="storefront-disclosure')).toBe(
      disclosure,
    );
  }
});
