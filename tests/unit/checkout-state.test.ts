import { describe, expect, it } from "vitest";
import { checkoutReducer } from "../../apps/storefront/app/checkout/checkout-state";
import type { QuoteDto } from "../../packages/contracts/src";

const quote: QuoteDto = {
  id: "quote",
  cartId: "cart",
  expiresAt: "2026-10-10T00:00:00Z",
  items: [],
  merchandiseSubtotalCents: 100,
  totalPayableCents: 100,
  shippingCents: 0,
  exclusiveTaxCents: 0,
  inclusiveTaxCents: 0,
  discountCents: 0,
};
describe("checkout review state", () => {
  it("reviews before placing and returns to the accepted quote after an error", () => {
    const editing = checkoutReducer(
      { phase: "editing", quote: null, message: "" },
      { type: "start" },
    );
    expect(editing.phase).toBe("reviewing");
    const ready = checkoutReducer(editing, { type: "quote", quote });
    expect(ready.phase).toBe("ready");
    const placing = checkoutReducer(ready, { type: "start" });
    expect(placing.phase).toBe("placing");
    const error = checkoutReducer(placing, {
      type: "message",
      message: "Try again",
    });
    expect(checkoutReducer(error, { type: "finish" })).toEqual({
      phase: "ready",
      quote,
      message: "Try again",
    });
  });
  it("keeps an in-flight request busy when the form changes", () => {
    const changed = checkoutReducer(
      { phase: "placing", quote, message: "" },
      { type: "quote", quote: null },
    );
    expect(changed.phase).toBe("placing");
    expect(changed.quote).toBeNull();
    expect(checkoutReducer(changed, { type: "finish" }).phase).toBe("editing");
  });
});
