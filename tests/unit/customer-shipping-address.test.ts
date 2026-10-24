import { expect, it } from "vitest";
import { customerShippingAddress } from "../../apps/backend/src/infrastructure/http/customer-page-view";

it("projects current shipping fields without exposing internal correction metadata", () => {
  expect(
    customerShippingAddress({
      country: "US",
      address: "42 Corrected Street",
      city: "Oakland",
      line2: "Apt 4",
      internalNote: "private",
      staffId: "private",
    }),
  ).toEqual({
    country: "US",
    address: "42 Corrected Street",
    city: "Oakland",
    line2: "Apt 4",
  });
});
it.each([null, [], {}, { country: "US", address: 3 }])(
  "handles absent or legacy address snapshots safely",
  (value) => expect(customerShippingAddress(value)).toBeUndefined(),
);
