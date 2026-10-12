import { expect, it } from "vitest";
import { analyticsPayload } from "./analytics";
import { safeJsonLd } from "./seo";
it("never records private account/order/recovery paths or query tokens", () => {
  for (const path of [
    "/en/orders/order-id",
    "/en/account",
    "/en/recover?token=secret",
    "/en?token=secret",
  ]) {
    expect(analyticsPayload(path)).toBeNull();
  }
  expect(analyticsPayload("/en/products/shirt")).toEqual({
    event: "page_view",
    path: "/en/products/shirt",
  });
});
it("escapes JSON-LD markup to prevent executable script injection", () => {
  expect(
    safeJsonLd({ name: "</script><script>alert(1)</script>" }),
  ).not.toContain("<");
});
