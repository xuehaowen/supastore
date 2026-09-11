import { describe, it, expect } from "vitest";
import { computeOrderFinancialProjection } from "@/domain/financial-projection/projection";
import { InvariantViolationError } from "@/application/common/errors";

describe("M2 Exact Confirmation, Surplus Returns & Cancellations", () => {
  describe("Exact-Payment Confirmation Gate (A2)", () => {
    it("rejects confirmation when order is underfunded and reports shortfall", () => {
      const purchaseTotalCents = 10000; // $100.00
      const receipts = [{ id: "r1", originalAmountCents: 8000 }]; // $80.00 received

      const projection = computeOrderFinancialProjection({
        purchaseTotalCents,
        isConfirmed: false,
        isCancelled: false,
        receipts,
      });

      expect(projection.netReceivedCents).toBe(8000);
      const shortfall = purchaseTotalCents - projection.netReceivedCents;
      expect(shortfall).toBe(2000); // $20.00 shortfall

      expect(() => {
        if (projection.netReceivedCents !== purchaseTotalCents) {
          throw new InvariantViolationError(
            `Order is underfunded. Required: ${purchaseTotalCents} cents, Net Received: ${projection.netReceivedCents} cents.`
          );
        }
      }).toThrow(InvariantViolationError);
    });

    it("verifies $40 purchase with $50 received and $10 excess returned can confirm only after settlement", () => {
      const purchaseTotalCents = 4000; // $40.00
      // Initial state: $50 received
      const initialReceipts = [{ id: "r1", originalAmountCents: 5000 }];

      const initialProj = computeOrderFinancialProjection({
        purchaseTotalCents,
        isConfirmed: false,
        isCancelled: false,
        receipts: initialReceipts,
      });

      expect(initialProj.netReceivedCents).toBe(5000);
      // Net received exceeds purchase total, so exact match (5000 === 4000) is false
      expect(initialProj.netReceivedCents === purchaseTotalCents).toBe(false);

      // When $10 excess return is authorized but not yet settled:
      const authorizedReceipts = [
        {
          id: "r1",
          originalAmountCents: 5000,
          effectiveNonPurchaseReturnAuthorizationsCents: 1000,
          settledNonPurchaseReturnsCents: 0,
        },
      ];
      const authProj = computeOrderFinancialProjection({
        purchaseTotalCents,
        isConfirmed: false,
        isCancelled: false,
        receipts: authorizedReceipts,
      });
      // Unsettled remainder exists, confirmation gate blocks
      expect(authProj.totalUnsentRemainderCents).toBe(1000);

      // After $10 excess return is settled:
      const settledReceipts = [
        {
          id: "r1",
          originalAmountCents: 5000,
          effectiveNonPurchaseReturnAuthorizationsCents: 1000,
          settledNonPurchaseReturnsCents: 1000, // $10.00 returned and settled
        },
      ];

      const settledProj = computeOrderFinancialProjection({
        purchaseTotalCents,
        isConfirmed: false,
        isCancelled: false,
        receipts: settledReceipts,
      });

      expect(settledProj.netReceivedCents).toBe(4000);
      expect(settledProj.netReceivedCents === purchaseTotalCents).toBe(true);
      expect(settledProj.totalUnsentRemainderCents).toBe(0);
    });
  });

  describe("Cancellations & Refund Obligations (A10, C11, C12)", () => {
    it("unpaid order cancellation results in zero refund obligations", () => {
      const purchaseTotalCents = 5000;
      const receipts: any[] = [];

      const proj = computeOrderFinancialProjection({
        purchaseTotalCents,
        isConfirmed: false,
        isCancelled: true,
        receipts,
      });

      expect(proj.netReceivedCents).toBe(0);
      expect(proj.totalSettledPayoutsCents).toBe(0);
      expect(proj.totalAuthorizedDispositionsCents).toBe(0);
    });

    it("confirmed order cancellation tracks received funds available for refund", () => {
      const purchaseTotalCents = 7500;
      const receipts = [{ id: "r1", originalAmountCents: 7500 }];

      const proj = computeOrderFinancialProjection({
        purchaseTotalCents,
        isConfirmed: true,
        isCancelled: true,
        receipts,
      });

      expect(proj.totalReceivedCents).toBe(7500);
      // All receipts retain full capacity for cancellation refund authorization
      expect(proj.receipts[0]!.availablePayoutCapacityCents).toBe(7500);
    });

    it("late payment on cancelled order classifies received funds as available for return (A7)", () => {
      const purchaseTotalCents = 6000;
      const receipts = [{ id: "r-late", originalAmountCents: 6000 }];

      const proj = computeOrderFinancialProjection({
        purchaseTotalCents,
        isConfirmed: false,
        isCancelled: true, // Order was cancelled prior to receipt arrival
        receipts,
      });

      expect(proj.totalReceivedCents).toBe(6000);
      expect(proj.receipts[0]!.availablePayoutCapacityCents).toBe(6000);
    });
  });
});
