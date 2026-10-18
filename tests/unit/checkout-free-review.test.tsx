import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("../../apps/storefront/app/actions", () => ({
  quoteCheckout: vi.fn(),
  placeCheckout: vi.fn(),
}));
import { CheckoutDetailsForm } from "../../apps/storefront/app/checkout-forms";
it("permits authoritative quote review before requiring a payment choice", () => {
  const html = renderToStaticMarkup(
    <CheckoutDetailsForm
      cartId={crypto.randomUUID()}
      locale="en"
      locations={[]}
      timezone="UTC"
      addresses={[]}
      accounts={[]}
      onlinePayment={false}
      shippingRules={[]}
      methods={["pickup"]}
      deliveryAreas={[]}
    />,
  );
  const payment = html.match(
    /<select\b[^>]*name="paymentAccountId"[^>]*>/,
  )![0]!;
  expect(payment).not.toContain('required=""');
  expect(html).not.toContain('value="" disabled=""');
});
