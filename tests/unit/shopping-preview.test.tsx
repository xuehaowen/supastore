import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ShoppingPreview } from "../../apps/storefront/app/shopping-preview";
it("lets customers choose country names instead of memorizing country codes", () => {
  const html = renderToStaticMarkup(
    <ShoppingPreview
      locale="en"
      items={[
        { variantId: "10000000-0000-4000-8000-000000000001", quantity: 1 },
      ]}
    />,
  );
  expect(html).toContain("United States");
  expect(html).not.toContain("Country code");
});
