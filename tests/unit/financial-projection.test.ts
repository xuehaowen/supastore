import { describe, it, expect } from 'vitest';
import {
  computeOrderFinancialProjection,
  computeReceiptProjection,
} from '@/domain/financial-projection/projection';
import {
  classifyPayoutTransfer,
} from '@/domain/financial-projection/discrepancies';

describe('Canonical Financial Projection Engine', () => {
  it('Scenario 1: $40 order, $50 received -> return $10 excess, confirm only after it settles', () => {
    // $40 order (4000 cents), receipt 1 for $50 (5000 cents)
    const projBeforeReturn = computeOrderFinancialProjection({
      purchaseTotalCents: 4000,
      isConfirmed: false,
      isCancelled: false,
      receipts: [
        {
          id: 'rcpt-1',
          originalAmountCents: 5000,
          effectiveNonPurchaseReturnAuthorizationsCents: 0,
          settledNonPurchaseReturnsCents: 0,
        },
      ],
    });

    expect(projBeforeReturn.totalReceivedCents).toBe(5000);
    expect(projBeforeReturn.netReceivedCents).toBe(5000);
    expect(projBeforeReturn.orderWideExcessCapacityCents).toBe(1000); // 5000 - 4000 = 1000 excess

    // Authorize $10 excess return (unsettled)
    const projWithAuthorizedReturn = computeOrderFinancialProjection({
      purchaseTotalCents: 4000,
      isConfirmed: false,
      isCancelled: false,
      receipts: [
        {
          id: 'rcpt-1',
          originalAmountCents: 5000,
          effectiveNonPurchaseReturnAuthorizationsCents: 1000,
          settledNonPurchaseReturnsCents: 0,
        },
      ],
    });

    // Net received is still 5000 before settlement, but Ui=1000 so there is an unsettled return
    expect(projWithAuthorizedReturn.receipts[0]!.unsentRemainderCents).toBe(1000);

    // Once $10 return is settled: net received becomes exactly 4000 = P, allowing confirmation!
    const projWithSettledReturn = computeOrderFinancialProjection({
      purchaseTotalCents: 4000,
      isConfirmed: false,
      isCancelled: false,
      receipts: [
        {
          id: 'rcpt-1',
          originalAmountCents: 5000,
          effectiveNonPurchaseReturnAuthorizationsCents: 1000,
          settledNonPurchaseReturnsCents: 1000,
        },
      ],
    });

    expect(projWithSettledReturn.netReceivedCents).toBe(4000);
    expect(projWithSettledReturn.isFullyFunded).toBe(true);
    expect(projWithSettledReturn.receipts[0]!.unsentRemainderCents).toBe(0);
  });

  it('Scenario 2: Confirmed $40, refund $40, late additional $10 -> original funding consumed, only new $10 is excess', () => {
    // Confirmed $40 with $40 receipt 1 (F1 = 4000), fully refunded (eff purchase refund = 4000, settled = 4000)
    // Then late receipt 2 arrives for $10 (1000 cents)
    const proj = computeOrderFinancialProjection({
      purchaseTotalCents: 4000,
      isConfirmed: true,
      isCancelled: false,
      receipts: [
        {
          id: 'rcpt-1',
          originalAmountCents: 4000,
          frozenPurchaseFundingCents: 4000,
          effectivePurchaseRefundAuthorizationsCents: 4000,
          settledPurchaseRefundsCents: 4000,
        },
        {
          id: 'rcpt-2',
          originalAmountCents: 1000,
          frozenPurchaseFundingCents: 0, // recorded after confirmation
          isRecordedAfterConfirmation: true,
        },
      ],
    });

    const r1 = proj.receipts[0]!;
    const r2 = proj.receipts[1]!;

    // Receipt 1 has no remaining refund capacity
    expect(r1.remainingPurchaseRefundCapacityCents).toBe(0);
    expect(r1.availablePayoutCapacityCents).toBe(0);

    // Receipt 2 has 1000 excess return capacity and 0 purchase refund capacity
    expect(r2.remainingPurchaseRefundCapacityCents).toBe(0);
    expect(r2.newExcessReturnCapacityCents).toBe(1000);
    expect(r2.availablePayoutCapacityCents).toBe(1000);
  });

  it('Scenario 3: Confirmed $100 corrected to actual $10 -> preserve P; future purchase funding capped at $10; funding loss $90', () => {
    const proj = computeOrderFinancialProjection({
      purchaseTotalCents: 10000,
      isConfirmed: true,
      isCancelled: false,
      receipts: [
        {
          id: 'rcpt-1',
          originalAmountCents: 10000,
          appliedCorrectionsCents: -9000, // corrected down to 1000 ($10)
          frozenPurchaseFundingCents: 10000,
        },
      ],
    });

    const r1 = proj.receipts[0]!;
    expect(r1.effectiveReceivedCents).toBe(1000);
    expect(r1.effectiveOriginalFundingCents).toBe(1000); // capped at Ri
    expect(r1.remainingPurchaseRefundCapacityCents).toBe(1000);

    // Funding loss view
    expect(proj.orderWideUncoveredAmountCents).toBe(9000); // 10000 - 1000 = 9000
    expect(proj.operationalFundingShortfallCents).toBe(9000);
  });

  it('Scenario 4: Same correction after $30 purchase refund settled -> keep $30 sent; total funding loss remains $90, not $110', () => {
    const proj = computeOrderFinancialProjection({
      purchaseTotalCents: 10000,
      isConfirmed: true,
      isCancelled: false,
      receipts: [
        {
          id: 'rcpt-1',
          originalAmountCents: 10000,
          appliedCorrectionsCents: -9000, // Ri = 1000
          frozenPurchaseFundingCents: 10000,
          effectivePurchaseRefundAuthorizationsCents: 3000,
          settledPurchaseRefundsCents: 3000, // S1 = 3000
        },
      ],
    });

    const r1 = proj.receipts[0]!;
    expect(r1.effectiveReceivedCents).toBe(1000);
    expect(r1.settledPayoutsCents).toBe(3000);
    expect(r1.availablePayoutCapacityCents).toBe(0);
    expect(r1.remainingPurchaseRefundCapacityCents).toBe(0);

    // Loss calculations: uncovered is max(0, 10000 - 1000) = 9000; over-disbursement is max(0, 3000 - 1000) = 2000
    // Operational shortfall is max(9000, 2000) = 9000 (not 9000 + 2000 = 11000)
    expect(proj.orderWideUncoveredAmountCents).toBe(9000);
    expect(proj.payoutOverDisbursementCents).toBe(2000);
    expect(proj.operationalFundingShortfallCents).toBe(9000);
  });
});

describe('Payout Discrepancy & Transfer Classification', () => {
  it('Scenario A: $50 claim sent to wrong destination -> T=50, C=0, E=50, leaves $50 owed', () => {
    const result = classifyPayoutTransfer({
      actualAmountCents: 5000,
      allocationAuthorizedCents: 5000,
      priorSettledCentsAcrossAttempts: 0,
      claimedDestination: { type: 'bank_account', accountNumberHash: 'verified-hash-123' },
      actualDestination: { type: 'bank_account', accountNumberHash: 'WRONG-hash-999' },
      attemptClaimedAmountCents: 5000,
      priorActualTransfersForAttemptCents: 0,
    });

    expect(result.customerSettlementCents).toBe(0); // C = 0
    expect(result.erroneousDisbursementCents).toBe(5000); // E = 5000
    expect(result.remainingUnsettledCents).toBe(5000); // U remains 5000
    expect(result.isDestinationMatched).toBe(false);
    expect(result.isClaimLimitBreached).toBe(false);
  });

  it('Scenario B: $50 claim actually sent as $70 to verified source -> C=50, E=20, breaches claim limit', () => {
    const result = classifyPayoutTransfer({
      actualAmountCents: 7000,
      allocationAuthorizedCents: 5000,
      priorSettledCentsAcrossAttempts: 0,
      claimedDestination: { type: 'bank_account', accountNumberHash: 'verified-hash-123' },
      actualDestination: { type: 'bank_account', accountNumberHash: 'verified-hash-123' },
      attemptClaimedAmountCents: 5000,
      priorActualTransfersForAttemptCents: 0,
    });

    expect(result.customerSettlementCents).toBe(5000); // C = min(7000, 5000) = 5000
    expect(result.erroneousDisbursementCents).toBe(2000); // E = 2000
    expect(result.remainingUnsettledCents).toBe(0);
    expect(result.isClaimLimitBreached).toBe(true); // 7000 > 5000
  });

  it('Scenario C: Verified $50 transfer against $50 claim -> C=50, E=0', () => {
    const result = classifyPayoutTransfer({
      actualAmountCents: 5000,
      allocationAuthorizedCents: 5000,
      priorSettledCentsAcrossAttempts: 0,
      claimedDestination: { type: 'bank_account', accountNumberHash: 'verified-hash-123' },
      actualDestination: { type: 'bank_account', accountNumberHash: 'verified-hash-123' },
      attemptClaimedAmountCents: 5000,
      priorActualTransfersForAttemptCents: 0,
    });

    expect(result.customerSettlementCents).toBe(5000);
    expect(result.erroneousDisbursementCents).toBe(0);
    expect(result.remainingUnsettledCents).toBe(0);
    expect(result.isClaimLimitBreached).toBe(false);
  });

  it('Scenario D: $30 partial transfer on $50 claim -> C=30, E=0, U=20', () => {
    const result = classifyPayoutTransfer({
      actualAmountCents: 3000,
      allocationAuthorizedCents: 5000,
      priorSettledCentsAcrossAttempts: 0,
      claimedDestination: { type: 'bank_account', accountNumberHash: 'verified-hash-123' },
      actualDestination: { type: 'bank_account', accountNumberHash: 'verified-hash-123' },
      attemptClaimedAmountCents: 5000,
      priorActualTransfersForAttemptCents: 0,
    });

    expect(result.customerSettlementCents).toBe(3000);
    expect(result.erroneousDisbursementCents).toBe(0);
    expect(result.remainingUnsettledCents).toBe(2000); // U = 2000
  });
});
