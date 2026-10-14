import type { customerAccount } from "@/application/use-cases/customers/customer-ownership";
import type { trackOrder } from "@/application/use-cases/tracking";
import type { getCart } from "@/application/use-cases/cart/get-cart";
import type { QuoteTerms } from "@/application/use-cases/get-quote";
import { orderItemName } from "@/domain/catalog/order-item-name";

export function cartView(cart: Awaited<ReturnType<typeof getCart>>) {
  if (!cart) return null;
  return {
    id: cart.id,
    revision: cart.revision,
    items: cart.items,
    subtotalCents: cart.subtotalCents,
    itemCount: cart.itemCount,
  };
}
export function accountView(
  account: Awaited<ReturnType<typeof customerAccount>>,
) {
  const credit = account.credit;
  return {
    customer: {
      name: account.customer.name,
      email: account.customer.email,
      phone: account.customer.phone,
    },
    addresses: account.addresses.map(({ id, label, address }) => ({
      id,
      label,
      address,
    })),
    orders: account.orders.map((order) => {
      const terms = order.termsSnapshot as QuoteTerms;
      return {
        id: order.id,
        referenceCode: order.referenceCode,
        lifecycleStatus: order.lifecycleStatus,
        purchaseTotalCents: order.purchaseTotalCents,
        termsSnapshot: { currency: terms.currency, precision: terms.precision },
      };
    }),
    hasNext: account.hasNext,
    credit: credit
      ? {
          account: {
            currency: credit.account.currency,
            precision: credit.account.precision,
            balanceCents: credit.account.balanceCents,
            reservedCents: credit.account.reservedCents,
          },
          entries: credit.entries.map(
            ({ id, amountCents, reason, createdAt }) => ({
              id,
              amountCents,
              reason,
              createdAt,
            }),
          ),
          reconciled: credit.reconciled,
          hasNext: credit.hasNext,
        }
      : null,
  };
}
export function orderView(result: Awaited<ReturnType<typeof trackOrder>>) {
  const { order, proposal, fulfillment } = result;
  return {
    order: {
      referenceCode: order.referenceCode,
      lifecycleStatus: order.lifecycleStatus,
      purchaseTotalCents: order.purchaseTotalCents,
      creditAppliedCents: order.creditAppliedCents,
      termsSnapshot: order.termsSnapshot,
      isClaimed: Boolean(order.customerId),
    },
    items: result.items.map((item) => ({
      id: item.id,
      variantId: item.variantId,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      catalogSnapshot: { title: orderItemName(item, result.quoteItems) },
    })),
    proposal: proposal
      ? {
          id: proposal.id,
          reason: proposal.reason,
          proposedTotalCents: proposal.proposedTotalCents,
        }
      : null,
    fulfillment: fulfillment ? { status: fulfillment.status } : null,
    receivedCents: result.receivedCents,
    goodsReturns: result.goodsReturns.map(
      ({ id, status, reason, reviewReason }) => ({
        id,
        status,
        reason,
        reviewReason,
      }),
    ),
    returnItems: result.returnItems.map(
      ({ returnId, orderItemId, quantity }) => ({
        returnId,
        orderItemId,
        quantity,
      }),
    ),
    evidence: result.evidence.map(({ id }) => ({ id })),
    refunds: result.refunds,
  };
}
