/**
 * Payout Discrepancy, Settlement Classification, and Breach Logic.
 * Implements transaction-contracts.md § Payout discrepancies.
 */

export interface Destination {
  type: 'bank_account' | 'card' | 'cash';
  accountNumberHash?: string;
  recipientName?: string;
  rawDestination?: string;
}

export interface ClassifyTransferInput {
  actualAmountCents: number; // T > 0
  allocationAuthorizedCents: number;
  priorSettledCentsAcrossAttempts: number;
  claimedDestination: Destination;
  actualDestination: Destination;
  attemptClaimedAmountCents: number;
  priorActualTransfersForAttemptCents: number;
}

export interface ClassifiedTransferResult {
  actualAmountCents: number; // T
  customerSettlementCents: number; // C = min(T, U) if matching, else 0
  erroneousDisbursementCents: number; // E = T - C
  remainingUnsettledCents: number; // U after this transfer
  isClaimLimitBreached: boolean; // cumulative actual for attempt > claimed intent
  isDestinationMatched: boolean;
}

export function areDestinationsEqual(d1: Destination, d2: Destination): boolean {
  if (d1.type !== d2.type) return false;
  if (d1.accountNumberHash && d2.accountNumberHash) {
    return d1.accountNumberHash === d2.accountNumberHash;
  }
  if (d1.rawDestination && d2.rawDestination) {
    return d1.rawDestination === d2.rawDestination;
  }
  return true;
}

export function classifyPayoutTransfer(input: ClassifyTransferInput): ClassifiedTransferResult {
  const T = input.actualAmountCents;
  if (T <= 0) {
    throw new Error(`Actual transfer amount T must be > 0. Received: ${T}`);
  }

  const U = Math.max(0, input.allocationAuthorizedCents - input.priorSettledCentsAcrossAttempts);
  const isDestinationMatched = areDestinationsEqual(input.claimedDestination, input.actualDestination);

  const C = isDestinationMatched ? Math.min(T, U) : 0;
  const E = T - C;
  const remainingUnsettledCents = Math.max(0, U - C);

  const cumulativeAttemptTransfers = input.priorActualTransfersForAttemptCents + T;
  const isClaimLimitBreached = cumulativeAttemptTransfers > input.attemptClaimedAmountCents;

  return {
    actualAmountCents: T,
    customerSettlementCents: C,
    erroneousDisbursementCents: E,
    remainingUnsettledCents,
    isClaimLimitBreached,
    isDestinationMatched,
  };
}
