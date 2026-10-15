import { describe, expect, it } from "vitest";
import { createManualOrder } from "@/application/use-cases/create-manual-order";

const input = {
  requestKey: "33333333-3333-4333-8333-333333333333",
  staffUserId: "owner",
  customerName: "Manual Customer",
  customerEmail: "manual@example.test",
  country: "US",
  address: "1 Manual Street",
  paymentAccountId: "11111111-1111-4111-8111-111111111111",
  items: [
    {
      variantId: "22222222-2222-4222-8222-222222222222",
      quantity: 1,
    },
  ],
};

describe("manual order validation", () => {
  it("requires a pickup location without requiring a shipping address", async () => {
    await expect(
      createManualOrder({
        ...input,
        fulfillmentType: "pickup",
        country: "",
        address: "",
      }),
    ).rejects.toThrow("Pickup location");
  });

  it("rejects unsupported manual fulfillment before writing", async () => {
    const unsupported = { ...input, fulfillmentType: "local_delivery" };
    await expect(createManualOrder(unsupported)).rejects.toThrow("Fulfillment");
  });

  it("requires a valid retry identity before writing", async () => {
    await expect(
      createManualOrder({ ...input, requestKey: "" }),
    ).rejects.toThrow("Manual order request");
  });
  it("rejects invalid customer email before writing", async () => {
    await expect(
      createManualOrder({ ...input, customerEmail: "invalid" }),
    ).rejects.toThrow("valid customer email");
  });

  it("rejects duplicate variants and invalid quantities", async () => {
    await expect(
      createManualOrder({
        ...input,
        items: [input.items[0]!, input.items[0]!],
      }),
    ).rejects.toThrow("duplicate product variants");
    await expect(
      createManualOrder({
        ...input,
        items: [{ ...input.items[0]!, quantity: 0 }],
      }),
    ).rejects.toThrow("Quantity");
  });
});
