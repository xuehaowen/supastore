export const PAYMENT_STATE_LABELS = {
  unpaid: "Unpaid",
  partially_paid: "Partially paid",
  paid: "Paid",
  partially_refunded: "Partially refunded",
  refunded: "Refunded",
  returned: "Payment returned",
} as const;

export type OrderPaymentState = keyof typeof PAYMENT_STATE_LABELS;

export interface OrderPaymentAmounts {
  purchaseTotalCents: number;
  creditAppliedCents: number;
  isCancelled: boolean;
  receivedCents: number;
  settledReturnsCents: number;
  settledRefundsCents: number;
}

/** Actual settled refunds take precedence over funding; approvals are not refunds. */
export function orderPaymentState(
  amounts: OrderPaymentAmounts,
): OrderPaymentState {
  const {
    purchaseTotalCents,
    receivedCents,
    settledReturnsCents,
    settledRefundsCents,
  } = amounts;
  if (settledRefundsCents > 0)
    return settledRefundsCents >= purchaseTotalCents
      ? "refunded"
      : "partially_refunded";
  const credit = amounts.isCancelled ? 0 : amounts.creditAppliedCents;
  if (receivedCents > 0 && settledReturnsCents >= receivedCents && credit === 0)
    return "returned";
  const funded = Math.max(0, receivedCents - settledReturnsCents) + credit;
  if (funded >= purchaseTotalCents) return "paid";
  return funded > 0 ? "partially_paid" : "unpaid";
}
