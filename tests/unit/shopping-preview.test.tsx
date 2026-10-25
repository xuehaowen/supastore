import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ShoppingPreview } from "../../apps/storefront/app/shopping-preview";
import { CheckoutPreview } from "../../apps/storefront/app/checkout-preview";
import { CART_LINE_LIMIT_MESSAGE } from "@supastore/contracts";
import { customerError } from "@supastore/i18n/customer";
it.each(["en", "zh"])(
  "explains oversized legacy carts in %s before attempting either preview",
  (locale) => {
    const items = Array.from({ length: 101 }, () => ({
      variantId: crypto.randomUUID(),
      quantity: 1,
    }));
    for (const html of [
      renderToStaticMarkup(<ShoppingPreview locale={locale} items={items} />),
      renderToStaticMarkup(<CheckoutPreview locale={locale} items={items} />),
    ]) {
      expect(html).toContain('role="alert"');
      expect(html).toContain(customerError(CART_LINE_LIMIT_MESSAGE, locale));
      expect(html).toContain("100");
    }
  },
);
it("lets customers choose country names instead of memorizing country codes", () => {
  const html = renderToStaticMarkup(
    <ShoppingPreview
      locale="en"
      destinations={{
        countries: [{ code: "US", name: "United States" }],
        states: [],
      }}
      items={[
        { variantId: "10000000-0000-4000-8000-000000000001", quantity: 1 },
      ]}
    />,
  );
  expect(html).toContain("United States");
  expect(html).not.toContain("Country code");
});
