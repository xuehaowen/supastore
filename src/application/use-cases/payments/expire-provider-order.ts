import { eq } from "drizzle-orm";
import type { Transaction } from "@/application/common/transaction";
import {
  orders,
  orderFulfillments,
  paymentReceipts,
  auditRecords,
} from "@/infrastructure/db/schema";
import { settleSlot } from "../inventory/slot-operations";
import { settleOrderStock } from "../inventory/stock-operations";
import { settleOrderCredit } from "../store-credit/credit-operations";
import { emitOrderEvent } from "@/application/common/events";

/** Trusted provider reconciliation only; caller holds order lock and verified a
 * definitive unpaid expiration for this accepted revision/amount. */
export async function expireProviderOrder(
  tx: Transaction,
  orderId: string,
  actorId: string,
) {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId));
  if (
    !order ||
    order.lifecycleStatus !== "unpaid" ||
    !(order.termsSnapshot as { onlinePayment?: boolean }).onlinePayment
  )
    return false;
  const [fulfillment] = await tx
    .select()
    .from(orderFulfillments)
    .where(eq(orderFulfillments.orderId, orderId));
  if (fulfillment && ["shipped", "fulfilled"].includes(fulfillment.status))
    return false;
  if (
    (
      await tx
        .select({ id: paymentReceipts.id })
        .from(paymentReceipts)
        .where(eq(paymentReceipts.orderId, orderId))
        .limit(1)
    ).length
  )
    return false;
  await settleSlot(tx, orderId, "released");
  await settleOrderStock(tx, orderId, "released", actorId);
  await settleOrderCredit(tx, orderId, "released", actorId);
  await tx
    .update(orders)
    .set({ lifecycleStatus: "cancelled", updatedAt: new Date() })
    .where(eq(orders.id, orderId));
  await emitOrderEvent(tx, orderId, "order.cancelled", order.guestEmail, {
    orderId,
    referenceCode: order.referenceCode,
    reason: "Online payment session definitively expired",
    previousLifecycleStatus: "unpaid",
    refundAuthorizedCents: 0,
  });
  await tx.insert(auditRecords).values({
    entityType: "order",
    entityId: orderId,
    actorId,
    action: "order.provider_expired",
    reason: "Authoritative provider session expired unpaid",
  });
  return true;
}
