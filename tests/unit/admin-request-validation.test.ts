import { describe, expect, it } from "vitest";
import { completePickupHandoff } from "@/application/use-cases/fulfillment/fulfillment-operations";
import { cancelOrder } from "@/application/use-cases/orders/cancel-order";
import { authorizeRefund } from "@/application/use-cases/refund-payout";
import {
  claimPayout,
  reconcilePayout,
  resolvePayoutDiscrepancy,
  closePayoutAttempt,
} from "@/application/use-cases/refund-payout";

describe("admin command validation", () => {
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

  it("rejects unsafe payout commands before database access", async () => {
    const destination = { type: "cash" as const, rawDestination: "drawer" };
    await expect(
      claimPayout({
        allocationId: "allocation",
        claimedAmountCents: 0,
        destination,
        ownerUserId: "owner",
      }),
    ).rejects.toThrow("Claimed payout amount must be a positive integer.");
    await expect(
      reconcilePayout({
        attemptId: "attempt",
        actualAmountCents: 1,
        transferReference: " ",
        actualDestination: destination,
        ownerUserId: "owner",
      }),
    ).rejects.toThrow("Transfer reference is required.");
    await expect(
      resolvePayoutDiscrepancy({
        discrepancyId: "discrepancy",
        writeOffCents: 0,
        resolutionReason: " ",
        ownerUserId: "owner",
      }),
    ).rejects.toThrow("Resolution reason is required.");
    await expect(
      closePayoutAttempt({
        attemptId: "attempt",
        reason: " ",
        ownerUserId: "owner",
      }),
    ).rejects.toThrow("Payout closure reason is required.");
  });
});
