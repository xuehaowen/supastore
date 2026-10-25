import { inArray, sql } from "drizzle-orm";
import type { Transaction } from "@/application/common/transaction";
import {
  orderPaymentState,
  type OrderPaymentAmounts,
  type OrderPaymentState,
} from "@/domain/money/order-payment-state";
import {
  orders,
  paymentReceipts,
  paymentReceiptCorrections,
  payoutAllocations,
  refundAuthorizations,
  storeCreditRefundSettlements,
} from "@/infrastructure/db/schema";

/** Load order-wide funding and settled refunds for the visible ledger page. */
export async function getOrderPaymentStates(
  tx: Transaction,
  orderIds: string[],
): Promise<Map<string, OrderPaymentState>> {
  if (!orderIds.length) return new Map();
  // execute preserves table qualification inside correlated subqueries.
  const amounts = await tx.execute<
    Omit<OrderPaymentAmounts, "isCancelled"> & {
      id: string;
      lifecycleStatus: string;
    }
  >(sql`select
    ${orders.id} as "id",
    ${orders.purchaseTotalCents} as "purchaseTotalCents",
    ${orders.creditAppliedCents} as "creditAppliedCents",
    ${orders.lifecycleStatus} as "lifecycleStatus",
    coalesce((select sum(greatest(0, ${paymentReceipts.amountCents} +
      coalesce((select sum(${paymentReceiptCorrections.deltaAmountCents})
        from ${paymentReceiptCorrections}
        where ${paymentReceiptCorrections.receiptId} = ${paymentReceipts.id}), 0)))
      from ${paymentReceipts} where ${paymentReceipts.orderId} = ${orders.id}), 0) as "receivedCents",
    coalesce((select sum(${payoutAllocations.settledAmountCents})
      from ${payoutAllocations} inner join ${paymentReceipts}
        on ${paymentReceipts.id} = ${payoutAllocations.receiptId}
      where ${paymentReceipts.orderId} = ${orders.id}
        and ${payoutAllocations.paymentReturnId} is not null), 0) as "settledReturnsCents",
    coalesce((select sum(${payoutAllocations.settledAmountCents})
      from ${payoutAllocations} inner join ${paymentReceipts}
        on ${paymentReceipts.id} = ${payoutAllocations.receiptId}
      where ${paymentReceipts.orderId} = ${orders.id}
        and ${payoutAllocations.refundAuthorizationId} is not null), 0)
    + coalesce((select sum(${storeCreditRefundSettlements.amountCents})
      from ${storeCreditRefundSettlements} inner join ${refundAuthorizations}
        on ${refundAuthorizations.id} = ${storeCreditRefundSettlements.refundAuthorizationId}
      where ${refundAuthorizations.orderId} = ${orders.id}), 0) as "settledRefundsCents"
    from ${orders} where ${inArray(orders.id, orderIds)}`);
  return new Map(
    amounts.map((row) => [
      row.id,
      orderPaymentState({
        purchaseTotalCents: Number(row.purchaseTotalCents),
        creditAppliedCents: Number(row.creditAppliedCents),
        receivedCents: Number(row.receivedCents),
        settledReturnsCents: Number(row.settledReturnsCents),
        settledRefundsCents: Number(row.settledRefundsCents),
        isCancelled: row.lifecycleStatus === "cancelled",
      }),
    ]),
  );
}
