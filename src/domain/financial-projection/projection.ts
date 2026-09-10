/**
 * Canonical Financial Projection Engine for SupaStore.
 * Implements the 10 canonical accounting rules from transaction-contracts.md.
 * All amounts are integer minor units (cents).
 */

export interface ReceiptInput {
  id: string;
  originalAmountCents: number;
  appliedCorrectionsCents?: number; // signed integer
  effectivePurchaseRefundAuthorizationsCents?: number;
  effectiveNonPurchaseReturnAuthorizationsCents?: number;
  settledPurchaseRefundsCents?: number;
  settledNonPurchaseReturnsCents?: number;
  frozenPurchaseFundingCents?: number; // Fi, set at confirmation
  isRecordedAfterConfirmation?: boolean;
}

export interface ReceiptProjection {
  id: string;
  originalAmountCents: number;
  correctionsCents: number;
  effectiveReceivedCents: number; // Ri = original + corrections >= 0
  authorizedDispositionsCents: number; // Ai = effective purchase refunds + non-purchase returns
  settledPayoutsCents: number; // Si = settled purchase refunds + settled returns
  unsentRemainderCents: number; // Ui = Ai - Si >= 0
  availablePayoutCapacityCents: number; // max(0, Ri - Ai)
  frozenFundingCents: number; // Fi
  effectiveOriginalFundingCents: number; // F'i = min(Fi, max(0, Ri - settled non-purchase returns))
  remainingPurchaseRefundCapacityCents: number; // min(F'i - prior purchase refunds, available payout capacity)
  newExcessReturnCapacityCents: number; // for confirmed orders: max(0, Ri - F'i - non-purchase returns), capped by available payout capacity
}

export interface OrderFinancialProjectionInput {
  purchaseTotalCents: number; // P
  isConfirmed: boolean;
  isCancelled: boolean;
  wasConfirmedBeforeCancellation?: boolean;
  receipts: ReceiptInput[];
}

export interface OrderFinancialProjection {
  purchaseTotalCents: number; // P
  isConfirmed: boolean;
  isCancelled: boolean;
  receipts: ReceiptProjection[];
  totalReceivedCents: number; // sum(Ri)
  totalSettledNonPurchaseReturnsCents: number;
  netReceivedCents: number; // sum(Ri) - settled non-purchase returns (before confirmation)
  isFullyFunded: boolean; // netReceived >= P
  unfundedAmountCents: number; // max(0, P - netReceived)
  totalAuthorizedDispositionsCents: number; // sum(Ai)
  totalSettledPayoutsCents: number; // sum(Si)
  totalUnsentRemainderCents: number; // sum(Ui)
  orderWideExcessCapacityCents: number;
  orderWideUncoveredAmountCents: number; // max(0, P + settled non-purchase returns - sum(Ri)) for confirmed
  payoutOverDisbursementCents: number; // max(0, sum(Si) - sum(Ri))
  operationalFundingShortfallCents: number; // max(uncovered, over-disbursement)
}

export function computeReceiptProjection(r: ReceiptInput, isConfirmed: boolean): ReceiptProjection {
  const corrections = r.appliedCorrectionsCents ?? 0;
  const Ri = Math.max(0, r.originalAmountCents + corrections);

  const effPurchaseRefunds = r.effectivePurchaseRefundAuthorizationsCents ?? 0;
  const effNonPurchaseReturns = r.effectiveNonPurchaseReturnAuthorizationsCents ?? 0;
  const Ai = Math.max(effPurchaseRefunds + effNonPurchaseReturns, (r.settledPurchaseRefundsCents ?? 0) + (r.settledNonPurchaseReturnsCents ?? 0));

  const Si = (r.settledPurchaseRefundsCents ?? 0) + (r.settledNonPurchaseReturnsCents ?? 0);
  const Ui = Math.max(0, Ai - Si);

  const availablePayoutCapacity = Math.max(0, Ri - Ai);

  const Fi = r.frozenPurchaseFundingCents ?? 0;
  const settledNonPurchase = r.settledNonPurchaseReturnsCents ?? 0;
  const settledPurchase = r.settledPurchaseRefundsCents ?? 0;

  // F'i = min(Fi, max(0, Ri - settled non-purchase returns from that receipt))
  const Fprime_i = Math.min(Fi, Math.max(0, Ri - settledNonPurchase));

  // Purchase refund authorization per receipt is capped both by remaining F'i after effective prior purchase refunds and available payout capacity
  const remainingFprime = Math.max(0, Fprime_i - effPurchaseRefunds);
  const remainingPurchaseRefundCapacity = Math.min(remainingFprime, availablePayoutCapacity);

  let newExcessReturnCapacity = 0;
  if (isConfirmed) {
    // Confirmed orders: max(0, Ri - F'i - effective non-purchase return authorizations), capped by available payout capacity
    const rawExcess = Math.max(0, Ri - Fprime_i - effNonPurchaseReturns);
    newExcessReturnCapacity = Math.min(rawExcess, availablePayoutCapacity);
  } else {
    // Before confirmation: per receipt capacity is capped by available payout capacity
    newExcessReturnCapacity = availablePayoutCapacity;
  }

  return {
    id: r.id,
    originalAmountCents: r.originalAmountCents,
    correctionsCents: corrections,
    effectiveReceivedCents: Ri,
    authorizedDispositionsCents: Ai,
    settledPayoutsCents: Si,
    unsentRemainderCents: Ui,
    availablePayoutCapacityCents: availablePayoutCapacity,
    frozenFundingCents: Fi,
    effectiveOriginalFundingCents: Fprime_i,
    remainingPurchaseRefundCapacityCents: remainingPurchaseRefundCapacity,
    newExcessReturnCapacityCents: newExcessReturnCapacity,
  };
}

export function computeOrderFinancialProjection(input: OrderFinancialProjectionInput): OrderFinancialProjection {
  const P = input.purchaseTotalCents;
  const receiptProjections = input.receipts.map((r) => computeReceiptProjection(r, input.isConfirmed));

  const totalReceivedCents = receiptProjections.reduce((sum, r) => sum + r.effectiveReceivedCents, 0);
  const totalSettledNonPurchase = input.receipts.reduce((sum, r) => sum + (r.settledNonPurchaseReturnsCents ?? 0), 0);
  const totalSettledPurchase = input.receipts.reduce((sum, r) => sum + (r.settledPurchaseRefundsCents ?? 0), 0);
  const totalSettledPayoutsCents = receiptProjections.reduce((sum, r) => sum + r.settledPayoutsCents, 0);
  const totalAuthorizedDispositionsCents = receiptProjections.reduce((sum, r) => sum + r.authorizedDispositionsCents, 0);
  const totalUnsentRemainderCents = receiptProjections.reduce((sum, r) => sum + r.unsentRemainderCents, 0);

  const netReceivedCents = totalReceivedCents - totalSettledNonPurchase;
  const isFullyFunded = netReceivedCents >= P;
  const unfundedAmountCents = Math.max(0, P - netReceivedCents);

  // Order-wide excess capacity calculation
  let orderWideExcessCapacityCents = 0;
  if (!input.isConfirmed) {
    const totalEffNonPurchase = input.receipts.reduce((sum, r) => sum + (r.effectiveNonPurchaseReturnAuthorizationsCents ?? 0), 0);
    orderWideExcessCapacityCents = Math.max(0, totalReceivedCents - P - totalEffNonPurchase);
  } else {
    orderWideExcessCapacityCents = receiptProjections.reduce((sum, r) => sum + r.newExcessReturnCapacityCents, 0);
  }

  // Loss calculations
  const isHistoricallyConfirmed = input.isConfirmed || (input.isCancelled && input.wasConfirmedBeforeCancellation === true);

  let orderWideUncoveredAmountCents = 0;
  let payoutOverDisbursementCents = Math.max(0, totalSettledPayoutsCents - totalReceivedCents);
  let operationalFundingShortfallCents = 0;

  if (isHistoricallyConfirmed) {
    // max(0, P + settled non-purchase returns - sum Ri)
    orderWideUncoveredAmountCents = Math.max(0, P + totalSettledNonPurchase - totalReceivedCents);
    operationalFundingShortfallCents = Math.max(orderWideUncoveredAmountCents, payoutOverDisbursementCents);
  } else {
    orderWideUncoveredAmountCents = 0;
    operationalFundingShortfallCents = payoutOverDisbursementCents;
  }

  return {
    purchaseTotalCents: P,
    isConfirmed: input.isConfirmed,
    isCancelled: input.isCancelled,
    receipts: receiptProjections,
    totalReceivedCents,
    totalSettledNonPurchaseReturnsCents: totalSettledNonPurchase,
    netReceivedCents,
    isFullyFunded,
    unfundedAmountCents,
    totalAuthorizedDispositionsCents,
    totalSettledPayoutsCents,
    totalUnsentRemainderCents,
    orderWideExcessCapacityCents,
    orderWideUncoveredAmountCents,
    payoutOverDisbursementCents,
    operationalFundingShortfallCents,
  };
}
