import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  orders,
  orderItems,
  quotes,
  orderFulfillments,
  paymentReceipts,
  paymentReceiptCorrections,
  confirmationFunding,
  refundAuthorizations,
  payoutAllocations,
  stockReservations,
  storeCreditReservations,
  orderReturns,
  auditRecords,
  paymentAccounts,
  paymentUploadIntents,
} from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { shipmentLines } from "@/application/use-cases/fulfillment/shipments";

/** Authorize and load the admin order view in one transaction. */
export async function getAdminOrderDetail(input: {
  staffUserId: string;
  orderId: string;
}) {
  const { staffUserId: staff, orderId: id } = input;
  return db.transaction(async (tx) => {
    const identity = await verifyStaffInTransaction(tx, staff);
    const [order] = await tx.select().from(orders).where(eq(orders.id, id));
    if (!order) return null;
    const [quote] = await tx
      .select()
      .from(quotes)
      .where(eq(quotes.id, order.quoteId));
    const items = await tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, id));
    const [fulfillment] = await tx
      .select()
      .from(orderFulfillments)
      .where(eq(orderFulfillments.orderId, id));
    const receipts = await tx
      .select()
      .from(paymentReceipts)
      .where(eq(paymentReceipts.orderId, id))
      .orderBy(asc(paymentReceipts.createdAt));
    const evidence = await tx
      .select({
        id: paymentUploadIntents.id,
        createdAt: paymentUploadIntents.createdAt,
      })
      .from(paymentUploadIntents)
      .where(
        and(
          eq(paymentUploadIntents.orderId, id),
          eq(paymentUploadIntents.status, "finalized"),
        ),
      )
      .orderBy(desc(paymentUploadIntents.createdAt));
    const corrections = receipts.length
      ? await tx
          .select()
          .from(paymentReceiptCorrections)
          .where(
            inArray(
              paymentReceiptCorrections.receiptId,
              receipts.map((r) => r.id),
            ),
          )
      : [];
    const allocations = receipts.length
      ? await tx
          .select()
          .from(payoutAllocations)
          .where(
            inArray(
              payoutAllocations.receiptId,
              receipts.map((r) => r.id),
            ),
          )
      : [];
    const funding = await tx
      .select()
      .from(confirmationFunding)
      .where(eq(confirmationFunding.orderId, id));
    const refunds = await tx
      .select()
      .from(refundAuthorizations)
      .where(eq(refundAuthorizations.orderId, id));
    const stock = await tx
      .select()
      .from(stockReservations)
      .where(eq(stockReservations.orderId, id));
    const [credit] = await tx
      .select()
      .from(storeCreditReservations)
      .where(eq(storeCreditReservations.orderId, id));
    const goodsReturns = await tx
      .select()
      .from(orderReturns)
      .where(eq(orderReturns.orderId, id));
    const activity = await tx
      .select()
      .from(auditRecords)
      .where(eq(auditRecords.entityId, id))
      .orderBy(desc(auditRecords.createdAt))
      .limit(50);
    const accounts = await tx
      .select()
      .from(paymentAccounts)
      .where(eq(paymentAccounts.isActive, true))
      .limit(100);
    return {
      identity,
      order,
      quote,
      items,
      fulfillment,
      shipmentLines: await shipmentLines(tx, id),
      receipts,
      evidence,
      corrections,
      allocations,
      funding,
      refunds,
      stock,
      credit,
      goodsReturns,
      activity,
      accounts,
    };
  });
}

export type AdminOrderDetail = NonNullable<
  Awaited<ReturnType<typeof getAdminOrderDetail>>
>;
