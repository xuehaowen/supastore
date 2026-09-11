import { describe, it, expect } from "vitest";
import {
  computeOrderFinancialProjection,
  computeReceiptProjection,
} from "@/domain/financial-projection/projection";

describe("M2 Audited Receipt Corrections & Funding Loss (A9)", () => {
  it("caps effective original funding at $10 when a confirmed $100 receipt is corrected to $10", () => {
    const receipt = {
      id: "r1",
      originalAmountCents: 10000, // $100.00 original
      appliedCorrectionsCents: -9000, // -$90.00 correction -> $10.00
      frozenPurchaseFundingCents: 10000, // Fi = $100.00
      settledPurchaseRefundsCents: 0,
      settledNonPurchaseReturnsCents: 0,
    };

    const proj = computeReceiptProjection(receipt, true);

    expect(proj.effectiveReceivedCents).toBe(1000); // Ri = $10.00
    expect(proj.effectiveOriginalFundingCents).toBe(1000); // F'i = min(Fi, Ri) = $10.00
    expect(proj.remainingPurchaseRefundCapacityCents).toBe(1000); // Capped by $10.00
  });

  it("calculates exact $90 shortfall (not $110) for confirmed $100 purchase corrected to $10 after settled $30 refund", () => {
    // Scenario: Confirmed $100 order, $30 refund already settled, receipt corrected down to $10
    const purchaseTotalCents = 10000;
    const receipts = [
      {
        id: "r1",
        originalAmountCents: 10000,
        appliedCorrectionsCents: -9000, // Ri becomes $10.00
        frozenPurchaseFundingCents: 10000,
        settledPurchaseRefundsCents: 3000, // $30.00 settled refund
        effectivePurchaseRefundAuthorizationsCents: 3000,
      },
    ];

    const proj = computeOrderFinancialProjection({
      purchaseTotalCents,
      isConfirmed: true,
      isCancelled: false,
      receipts,
    });

    // Uncovered = max(0, P + settledNonPurchaseReturns - sum(Ri)) = max(0, 10000 - 1000) = 9000 ($90.00)
    expect(proj.orderWideUncoveredAmountCents).toBe(9000);
    // Over-disbursement = max(0, sum(Si) - sum(Ri)) = max(0, 3000 - 1000) = 2000 ($20.00)
    expect(proj.payoutOverDisbursementCents).toBe(2000);
    // Operational funding shortfall = max(uncovered, overDisbursement) = max(9000, 2000) = 9000 ($90.00, NOT $110.00!)
    expect(proj.operationalFundingShortfallCents).toBe(9000);
  });

  it("preserves settled payout history and prevents negative balances", () => {
    const receipt = {
      id: "r1",
      originalAmountCents: 5000,
      appliedCorrectionsCents: -5000, // Corrected all the way to 0
      frozenPurchaseFundingCents: 5000,
      settledPurchaseRefundsCents: 2000, // Settled $20 payout remains intact
    };

    const proj = computeReceiptProjection(receipt, true);

    expect(proj.effectiveReceivedCents).toBe(0);
    expect(proj.settledPayoutsCents).toBe(2000);
    expect(proj.availablePayoutCapacityCents).toBe(0); // Cannot authorize further payouts
  });
});
