import { describe, it, expect } from "vitest";
import {
  computeOrderFinancialProjection,
  computeReceiptProjection,
} from "@/domain/financial-projection/projection";
import {
  classifyPayoutTransfer,
  areDestinationsEqual,
  type Destination,
} from "@/domain/financial-projection/discrepancies";

describe("M2 Executable Accounting Contract Suite (transaction-contracts.md)", () => {
  const verifiedDest: Destination = {
    type: "bank_account",
    accountNumberHash: "verified-hash-123",
  };
  const wrongDest: Destination = {
    type: "bank_account",
    accountNumberHash: "wrong-hash-456",
  };

  describe("Canonical Table-Driven Scenarios", () => {
    it("Scenario: $40 order, $50 received -> return $10 excess; confirm only after it settles", () => {
      const p = 4000;
      // Step 1: Received $50
      const projInitial = computeOrderFinancialProjection({
        purchaseTotalCents: p,
        isConfirmed: false,
        isCancelled: false,
        receipts: [
          {
            id: "r1",
            originalAmountCents: 5000,
          },
        ],
      });
      expect(projInitial.netReceivedCents).toBe(5000);
      expect(projInitial.orderWideExcessCapacityCents).toBe(1000); // 1000 excess over P
      expect(projInitial.netReceivedCents === p).toBe(false); // net received is not exactly equal to P

      // Step 2: Return $10 excess authorized & settled
      const projSettled = computeOrderFinancialProjection({
        purchaseTotalCents: p,
        isConfirmed: false,
        isCancelled: false,
        receipts: [
          {
            id: "r1",
            originalAmountCents: 5000,
            effectiveNonPurchaseReturnAuthorizationsCents: 1000,
            settledNonPurchaseReturnsCents: 1000,
          },
        ],
      });
      expect(projSettled.netReceivedCents).toBe(4000);
      expect(projSettled.isFullyFunded).toBe(true); // Now exactly 4000 = P!
    });

    it("Scenario: Confirmed $40, refund $40, late additional $10 -> original funding consumed, only new $10 is excess", () => {
      const proj = computeOrderFinancialProjection({
        purchaseTotalCents: 4000,
        isConfirmed: true,
        isCancelled: false,
        receipts: [
          {
            id: "r1",
            originalAmountCents: 4000,
            frozenPurchaseFundingCents: 4000,
            effectivePurchaseRefundAuthorizationsCents: 4000,
            settledPurchaseRefundsCents: 4000,
          },
          {
            id: "r2",
            originalAmountCents: 1000,
            frozenPurchaseFundingCents: 0,
            isRecordedAfterConfirmation: true,
          },
        ],
      });

      const r1 = proj.receipts[0]!;
      const r2 = proj.receipts[1]!;

      expect(r1.remainingPurchaseRefundCapacityCents).toBe(0);
      expect(r2.remainingPurchaseRefundCapacityCents).toBe(0);
      expect(r2.newExcessReturnCapacityCents).toBe(1000);
      expect(r2.availablePayoutCapacityCents).toBe(1000);
    });

    it("Scenario: Unpaid $40 order cancelled -> No refund row; late $40 creates a separate return", () => {
      const proj = computeOrderFinancialProjection({
        purchaseTotalCents: 4000,
        isConfirmed: false,
        isCancelled: true,
        receipts: [
          {
            id: "r-late",
            originalAmountCents: 4000,
            frozenPurchaseFundingCents: 0,
            isRecordedAfterConfirmation: true,
          },
        ],
      });

      const rLate = proj.receipts[0]!;
      // On cancelled unpaid order, late receipt allocates only as separate return
      expect(rLate.remainingPurchaseRefundCapacityCents).toBe(0);
      expect(rLate.newExcessReturnCapacityCents).toBe(4000);
      expect(rLate.availablePayoutCapacityCents).toBe(4000);
    });

    it("Scenario: Open order receives $10 of $40, then cancels -> Actual-funds cancellation entitlement is $10", () => {
      const proj = computeOrderFinancialProjection({
        purchaseTotalCents: 4000,
        isConfirmed: false,
        isCancelled: true,
        receipts: [
          {
            id: "r1",
            originalAmountCents: 1000,
            effectiveNonPurchaseReturnAuthorizationsCents: 0,
            settledNonPurchaseReturnsCents: 0,
          },
        ],
      });

      const r1 = proj.receipts[0]!;
      // On open-order cancellation, remaining per-receipt capacity is actual-funds cancellation refund ($10)
      expect(r1.availablePayoutCapacityCents).toBe(1000);
      expect(r1.newExcessReturnCapacityCents).toBe(1000);
    });

    it("Scenario: Confirmed $100 corrected to actual $10 -> preserve P; future purchase funding capped at $10; funding loss $90", () => {
      const proj = computeOrderFinancialProjection({
        purchaseTotalCents: 10000,
        isConfirmed: true,
        isCancelled: false,
        receipts: [
          {
            id: "r1",
            originalAmountCents: 10000,
            appliedCorrectionsCents: -9000,
            frozenPurchaseFundingCents: 10000,
          },
        ],
      });

      const r1 = proj.receipts[0]!;
      expect(r1.effectiveReceivedCents).toBe(1000);
      expect(r1.effectiveOriginalFundingCents).toBe(1000);
      expect(r1.remainingPurchaseRefundCapacityCents).toBe(1000);
      expect(proj.operationalFundingShortfallCents).toBe(9000);
    });

    it("Scenario: Confirmed $100 corrected to $10 after $30 refund settled -> keep $30 sent; no further entitlement; shortfall is $90 not $110", () => {
      const proj = computeOrderFinancialProjection({
        purchaseTotalCents: 10000,
        isConfirmed: true,
        isCancelled: false,
        receipts: [
          {
            id: "r1",
            originalAmountCents: 10000,
            appliedCorrectionsCents: -9000,
            frozenPurchaseFundingCents: 10000,
            effectivePurchaseRefundAuthorizationsCents: 3000,
            settledPurchaseRefundsCents: 3000,
          },
        ],
      });

      const r1 = proj.receipts[0]!;
      expect(r1.settledPayoutsCents).toBe(3000);
      expect(r1.remainingPurchaseRefundCapacityCents).toBe(0);
      expect(r1.availablePayoutCapacityCents).toBe(0);
      expect(proj.orderWideUncoveredAmountCents).toBe(9000);
      expect(proj.payoutOverDisbursementCents).toBe(2000);
      expect(proj.operationalFundingShortfallCents).toBe(9000); // max(9000, 2000), not sum
    });

    it("Scenario: Cancelled open order had $10 refunded, receipt corrected to $100 -> Authorize separate $90 return", () => {
      // Open order received $10, cancelled, $10 refunded/returned, then receipt corrected to $100 (+9000 cents)
      const proj = computeOrderFinancialProjection({
        purchaseTotalCents: 4000,
        isConfirmed: false,
        isCancelled: true,
        receipts: [
          {
            id: "r1",
            originalAmountCents: 1000,
            appliedCorrectionsCents: 9000, // corrected to 10000
            effectiveNonPurchaseReturnAuthorizationsCents: 1000,
            settledNonPurchaseReturnsCents: 1000,
          },
        ],
      });

      const r1 = proj.receipts[0]!;
      expect(r1.effectiveReceivedCents).toBe(10000);
      // Ri=10000, Ai=1000 -> remaining capacity max(0, 10000 - 1000) = 9000
      expect(r1.availablePayoutCapacityCents).toBe(9000);
      expect(r1.newExcessReturnCapacityCents).toBe(9000);
    });
  });

  describe("Cross-Attempt Payout Discrepancy & Late Evidence Flows", () => {
    it("Flow 1: $50 authorization with $30 claim paid as $50 to verified source -> C=50, E=0, U=0; claim-limit breach flagged, 0 replacement", () => {
      const classification = classifyPayoutTransfer({
        actualAmountCents: 5000,
        allocationAuthorizedCents: 5000,
        priorSettledCentsAcrossAttempts: 0,
        claimedDestination: verifiedDest,
        actualDestination: verifiedDest,
        attemptClaimedAmountCents: 3000,
        priorActualTransfersForAttemptCents: 0,
      });

      expect(classification.customerSettlementCents).toBe(5000);
      expect(classification.erroneousDisbursementCents).toBe(0);
      expect(classification.remainingUnsettledCents).toBe(0);
      expect(classification.isClaimLimitBreached).toBe(true);
    });

    it("Flow 2: $50 claim closed after $30 settlement, $20 replacement started, then late evidence of $20 arrives on original -> C=20, E=0, U=0", () => {
      // Step A: First transfer was $30
      const firstTransfer = classifyPayoutTransfer({
        actualAmountCents: 3000,
        allocationAuthorizedCents: 5000,
        priorSettledCentsAcrossAttempts: 0,
        claimedDestination: verifiedDest,
        actualDestination: verifiedDest,
        attemptClaimedAmountCents: 5000,
        priorActualTransfersForAttemptCents: 0,
      });
      expect(firstTransfer.customerSettlementCents).toBe(3000);
      expect(firstTransfer.remainingUnsettledCents).toBe(2000);

      // Step B: Late evidence of $20 arrives on the original attempt
      const lateEvidence = classifyPayoutTransfer({
        actualAmountCents: 2000,
        allocationAuthorizedCents: 5000,
        priorSettledCentsAcrossAttempts: 3000,
        claimedDestination: verifiedDest,
        actualDestination: verifiedDest,
        attemptClaimedAmountCents: 5000,
        priorActualTransfersForAttemptCents: 3000,
      });
      expect(lateEvidence.customerSettlementCents).toBe(2000);
      expect(lateEvidence.erroneousDisbursementCents).toBe(0);
      expect(lateEvidence.remainingUnsettledCents).toBe(0);

      // Step C: If replacement also sent $20, it classifies with C=0, E=20
      const replacementTransfer = classifyPayoutTransfer({
        actualAmountCents: 2000,
        allocationAuthorizedCents: 5000,
        priorSettledCentsAcrossAttempts: 5000, // already 5000 settled
        claimedDestination: verifiedDest,
        actualDestination: verifiedDest,
        attemptClaimedAmountCents: 2000,
        priorActualTransfersForAttemptCents: 0,
      });
      expect(replacementTransfer.customerSettlementCents).toBe(0);
      expect(replacementTransfer.erroneousDisbursementCents).toBe(2000); // Erroneous because customer is fully settled
    });
  });

  describe("Fuzzing & Invariant Testing (500 iterations)", () => {
    it("maintains non-negative balances, exact precision, and funding shortfall rules across random configurations", () => {
      for (let i = 0; i < 500; i++) {
        const purchaseTotalCents = Math.floor(Math.random() * 50000) + 100; // $1.00 to $500.00
        const isConfirmed = Math.random() > 0.5;
        const isCancelled = Math.random() > 0.5;

        const numReceipts = Math.floor(Math.random() * 3) + 1;
        const receipts = [];

        for (let r = 0; r < numReceipts; r++) {
          const originalAmountCents = Math.floor(Math.random() * 30000) + 100;
          const correction = Math.floor(Math.random() * 10000) - 5000;
          // Ri >= 0
          const appliedCorrectionsCents = Math.max(-originalAmountCents, correction);
          const frozenFunding = isConfirmed ? Math.min(originalAmountCents, purchaseTotalCents) : 0;
          const settledRefunds = Math.floor(Math.random() * frozenFunding);

          receipts.push({
            id: `r-${r}`,
            originalAmountCents,
            appliedCorrectionsCents,
            frozenPurchaseFundingCents: frozenFunding,
            settledPurchaseRefundsCents: settledRefunds,
            effectivePurchaseRefundAuthorizationsCents: settledRefunds,
          });
        }

        const proj = computeOrderFinancialProjection({
          purchaseTotalCents,
          isConfirmed,
          isCancelled,
          receipts,
        });

        // Invariants:
        expect(proj.totalReceivedCents).toBeGreaterThanOrEqual(0);
        expect(proj.netReceivedCents).toBeGreaterThanOrEqual(0);
        expect(proj.orderWideUncoveredAmountCents).toBeGreaterThanOrEqual(0);
        expect(proj.payoutOverDisbursementCents).toBeGreaterThanOrEqual(0);
        expect(proj.operationalFundingShortfallCents).toBe(
          Math.max(proj.orderWideUncoveredAmountCents, proj.payoutOverDisbursementCents)
        );

        for (const r of proj.receipts) {
          expect(r.effectiveReceivedCents).toBeGreaterThanOrEqual(0);
          expect(r.effectiveOriginalFundingCents).toBeGreaterThanOrEqual(0);
          expect(r.availablePayoutCapacityCents).toBeGreaterThanOrEqual(0);
          expect(r.remainingPurchaseRefundCapacityCents).toBeGreaterThanOrEqual(0);
          expect(r.newExcessReturnCapacityCents).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(r.effectiveReceivedCents)).toBe(true);
        }
      }
    });
  });
});
