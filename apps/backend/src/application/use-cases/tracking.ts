import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  orders,
  orderItems,
  orderFulfillments,
  orderProposals,
  paymentReceipts,
  paymentUploadIntents,
  quotes,
  orderReturns,
  orderReturnItems,
  paymentReceiptCorrections,
  payoutAllocations,
  refundAuthorizations,
  storeCreditRefundSettlements,
} from "@/infrastructure/db/schema";
import { verifyOrderAccess } from "@/application/common/guest-access";
export async function trackOrder(orderId: string, sessionToken: string) {
  return db.transaction(async (tx) => {
    await verifyOrderAccess(tx, orderId, sessionToken);
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, orderId));
    const items = await tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));
    const [fulfillment] = await tx
      .select()
      .from(orderFulfillments)
      .where(eq(orderFulfillments.orderId, orderId));
    const [proposal] = await tx
      .select()
      .from(orderProposals)
      .where(
        and(
          eq(orderProposals.orderId, orderId),
          eq(orderProposals.status, "pending"),
        ),
      );
    const receipts = await tx
      .select()
      .from(paymentReceipts)
      .where(eq(paymentReceipts.orderId, orderId));
    const evidence = await tx
      .select({
        id: paymentUploadIntents.id,
        finalizedAt: paymentUploadIntents.finalizedAt,
      })
      .from(paymentUploadIntents)
      .where(
        and(
          eq(paymentUploadIntents.orderId, orderId),
          eq(paymentUploadIntents.status, "finalized"),
        ),
      );
    const [quote] = await tx
      .select()
      .from(quotes)
      .where(eq(quotes.id, order!.quoteId));
    const goodsReturns = await tx
      .select()
      .from(orderReturns)
      .where(eq(orderReturns.orderId, orderId));
    const returnItems = goodsReturns.length
      ? await tx
          .select()
          .from(orderReturnItems)
          .where(
            inArray(
              orderReturnItems.returnId,
              goodsReturns.map((r) => r.id),
            ),
          )
      : [];
    const receiptIds = receipts.map((r) => r.id);
    const corrections = receiptIds.length
      ? await tx
          .select()
          .from(paymentReceiptCorrections)
          .where(inArray(paymentReceiptCorrections.receiptId, receiptIds))
      : [];
    const allocations = receiptIds.length
      ? await tx
          .select()
          .from(payoutAllocations)
          .where(inArray(payoutAllocations.receiptId, receiptIds))
      : [];
    const refunds = await tx
      .select()
      .from(refundAuthorizations)
      .where(eq(refundAuthorizations.orderId, orderId));
    const creditSettlements = refunds.length
      ? await tx
          .select()
          .from(storeCreditRefundSettlements)
          .where(
            inArray(
              storeCreditRefundSettlements.refundAuthorizationId,
              refunds.map((r) => r.id),
            ),
          )
      : [];
    return {
      order: order!,
      items,
      fulfillment,
      proposal,
      receivedCents:
        receipts.reduce((n, r) => n + r.amountCents, 0) +
        corrections.reduce((n, c) => n + c.deltaAmountCents, 0) -
        allocations
          .filter((a) => a.paymentReturnId)
          .reduce((n, a) => n + a.settledAmountCents, 0),
      quoteItems: quote?.itemsSnapshot,
      goodsReturns,
      returnItems,
      refunds: refunds.map((r) => ({
        id: r.id,
        amountCents: r.amountCents,
        reason: r.reason,
        settledCents:
          allocations
            .filter((a) => a.refundAuthorizationId === r.id)
            .reduce((sum, a) => sum + a.settledAmountCents, 0) +
          creditSettlements
            .filter((s) => s.refundAuthorizationId === r.id)
            .reduce((sum, s) => sum + s.amountCents, 0),
      })),
      evidence,
    };
  });
}
