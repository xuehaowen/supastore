import { expect, it } from "vitest";
import { parseQuoteRequest } from "@/application/common/quote-request";

const input = { cartId: "11111111-1111-4111-8111-111111111111", fulfillmentType: "shipping", country: " us ", address: " 1 Main St ", region: " ca " };
it("normalizes identical form and JSON quote inputs", () => {
  const parsed = parseQuoteRequest(input);
  expect(parsed).toMatchObject({ country: "US", address: "1 Main St", region: "CA", postalCode: "", promotionCode: "" });
  expect(parseQuoteRequest({ ...input, pickupLocationId: "", paymentAccountId: "", deliveryAreaId: "" })).toEqual(parsed);
});
it.each([
  { address: "x".repeat(2001) }, { region: "x".repeat(13) },
  { promotionCode: "x".repeat(101) }, { country: "USA" },
  { paymentAccountId: "invalid" }, { deliveryAreaId: [] },
  { fulfillmentType: ["shipping"] }, { address: { toString: () => "Street" } },
])("rejects malformed or overlong quote fields before calculating a quote", (change) => {
  expect(() => parseQuoteRequest({ ...input, ...change })).toThrow();
});
