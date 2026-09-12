import { describe, expect, it } from "vitest";
import { fulfillOrder } from "@/application/use-cases/fulfill-order";
import { completePickupHandoff } from "@/application/use-cases/fulfillment/fulfillment-operations";
import { cancelOrder } from "@/application/use-cases/orders/cancel-order";
import { authorizeRefund } from "@/application/use-cases/refund-payout";

describe("admin command validation", () => {
  it("requires an explicit carrier or manual delivery method", async () => {
    await expect(
      fulfillOrder({ orderId: "order", staffUserId: "staff" }),
    ).rejects.toThrow("Carrier or manual delivery method is required.");
  });

  it("requires a recipient and supported pickup verification method", async () => {
    await expect(
      completePickupHandoff({
        orderId: "order",
        staffUserId: "staff",
        handoffActor: "",
        verificationMethod: "scoped_order_page",
      }),
    ).rejects.toThrow("Handoff actor identity is required.");
    await expect(
      completePickupHandoff({
        orderId: "order",
        staffUserId: "staff",
        handoffActor: "Customer",
        verificationMethod: "invalid" as never,
      }),
    ).rejects.toThrow("A valid pickup verification method is required.");
  });

  it("rejects missing reasons and non-positive refunds before database access", async () => {
    await expect(
      cancelOrder({ orderId: "order", actorUserId: "owner", reason: " " }),
    ).rejects.toThrow("Cancellation reason is required.");
    await expect(
      authorizeRefund({
        orderId: "order",
        receiptId: "receipt",
        amountCents: 0,
        reason: "refund",
        ownerUserId: "owner",
      }),
    ).rejects.toThrow("Refund amount must be a positive integer.");
  });
});
