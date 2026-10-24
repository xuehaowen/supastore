import { describe, expect, it } from "vitest";
import {
  orderPaymentState,
  type OrderPaymentAmounts,
} from "@/domain/money/order-payment-state";

const amounts: OrderPaymentAmounts = {
  purchaseTotalCents: 10000,
  creditAppliedCents: 0,
  isCancelled: false,
  receivedCents: 0,
  settledReturnsCents: 0,
  settledRefundsCents: 0,
};

describe("order payment status", () => {
  it.each([
    [{}, "unpaid"],
    [{ receivedCents: 3000 }, "partially_paid"],
    [{ receivedCents: 10000 }, "paid"],
    [{ receivedCents: 12000 }, "paid"],
    [{ creditAppliedCents: 10000 }, "paid"],
    [{ creditAppliedCents: 3000 }, "partially_paid"],
    [{ creditAppliedCents: 3000, receivedCents: 7000 }, "paid"],
    [{ purchaseTotalCents: 0 }, "paid"],
    [{ receivedCents: 10000, settledRefundsCents: 3000 }, "partially_refunded"],
    [
      {
        receivedCents: 7000,
        creditAppliedCents: 3000,
        settledRefundsCents: 10000,
      },
      "refunded",
    ],
    [{ receivedCents: 12000, settledReturnsCents: 2000 }, "paid"],
    [{ receivedCents: 10000, settledReturnsCents: 3000 }, "partially_paid"],
    [
      { receivedCents: 10000, settledReturnsCents: 10000, isCancelled: true },
      "returned",
    ],
    [{ creditAppliedCents: 10000, isCancelled: true }, "unpaid"],
  ] as [Partial<OrderPaymentAmounts>, string][])(
    "classifies %j as %s",
    (changes, expected) => {
      expect(orderPaymentState({ ...amounts, ...changes })).toBe(expected);
    },
  );
});
