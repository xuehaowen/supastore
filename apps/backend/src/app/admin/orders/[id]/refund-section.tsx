import type { ReactNode } from "react";
import type { AdminOrderDetail } from "@/application/use-cases/orders/get-admin-order-detail";
import type { QuoteTerms } from "@/application/use-cases/get-quote";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { CurrencyField } from "@/app/admin/currency-field";
import { AdminDialog } from "@/app/admin/admin-dialog";
import { Field, Hidden } from "@/app/components";
import { Button } from "@supastore/ui/button";
import { Alert, AlertDescription } from "@supastore/ui/alert";
import { orderItemName } from "@/domain/catalog/order-item-name";
import { refundPurchaseAction } from "@/app/admin/credit-actions";
import { resolveRewardReviewAction } from "@/app/admin/reward-actions";

export function OrderRefundSection({
  data,
  terms,
  format,
  identity,
  detailReturnTo,
}: {
  data: AdminOrderDetail;
  terms: QuoteTerms;
  format: (amount: number) => string;
  identity: ReactNode;
} & { detailReturnTo: string }) {
  const o = data.order,
    id = o.id;
  const remainingRefund =
    o.purchaseTotalCents -
    data.refunds
      .filter((a) => a.kind === "purchase_refund")
      .reduce((sum, a) => sum + a.amountCents, 0);
  return (
    <section className="panel">
      <h2>Returns & refunds</h2>
      {data.goodsReturns.map((r) => (
        <p key={r.id}>
          <Link href={`/admin/returns/${r.id}`}>
            {r.reason} · {r.status}
          </Link>
        </p>
      ))}
      {data.refunds.map((r) => (
        <p key={r.id}>
          {r.reason} · {format(r.amountCents)} authorized
        </p>
      ))}
      {data.identity.role === "owner" &&
        ["confirmed", "completed"].includes(o.lifecycleStatus) &&
        remainingRefund > 0 && (
          <AdminDialog
            trigger="Refund purchase"
            title="Authorize purchase refund"
            description="Credit-funded amounts settle back to credit. External amounts are allocated to their original receipts for payout. This action reserves the entitlement once."
          >
            <form action={refundPurchaseAction}>
              {identity}
              <Hidden name="requestKey" value={randomUUID()} />
              <p>Remaining purchase entitlement: {format(remainingRefund)}</p>
              <CurrencyField
                currency={terms.currency}
                precision={terms.precision}
                name="amountCents"
                label="Refund amount"
              />
              <Field name="reason" label="Refund reason" />
              {o.rewardSnapshot && (
                <fieldset>
                  <legend>Detailed refund allocation (optional)</legend>
                  <p>
                    Enter which merchandise, tax, and fulfillment amounts are
                    refunded. Leave all zero to allocate proportionally.
                    Detailed amounts must add up to the refund total and retain
                    their original payment source.
                  </p>
                  {o.rewardSnapshot.allocations
                    .filter((item) => item.amount > 0)
                    .map((item) => (
                      <div key={item.id}>
                        <p>
                          {item.type === "merchandise"
                            ? orderItemName(
                                data.items.find(
                                  (line) => line.variantId === item.id,
                                ) ?? { variantId: item.id },
                                data.quote?.itemsSnapshot,
                              )
                            : item.type === "tax"
                              ? "Tax"
                              : "Fulfillment fee"}
                        </p>
                        <CurrencyField
                          currency={terms.currency}
                          precision={terms.precision}
                          name={`external:${item.id}`}
                          label={`External payment refund (up to ${format(item.externalAmount)})`}
                          value="0"
                          required={false}
                        />
                        <CurrencyField
                          currency={terms.currency}
                          precision={terms.precision}
                          name={`credit:${item.id}`}
                          label={`Credit refund (up to ${format(item.creditAmount)})`}
                          value="0"
                          required={false}
                        />
                      </div>
                    ))}
                </fieldset>
              )}
              <Button type="submit">Authorize source-aware refund</Button>
            </form>
          </AdminDialog>
        )}
      <Link href={`/admin/payments?managePayment=${id}`}>
        Payouts, surplus returns & corrections
      </Link>
      {o.rewardFundingReview && (
        <div>
          <Alert variant="destructive">
            <AlertDescription>
              Reward funding requires review after a receipt correction. Pending
              rewards are suspended; issued rewards have been conservatively
              reversed. Original-source refund entitlements remain recorded.
            </AlertDescription>
          </Alert>
          {data.identity.role === "owner" && (
            <form action={resolveRewardReviewAction}>
              <Hidden name="returnTo" value={detailReturnTo} />
              <Hidden name="orderId" value={o.id} />
              <Hidden name="requestKey" value={randomUUID()} />
              <p>
                Verify and correct every original frozen receipt first. Another
                payment cannot replace a corrected source. Resolving review
                restores only the supported accepted reward, including its debt
                history.
              </p>
              <Field
                name="reason"
                label="Verified funding evidence and review reason"
              />
              <Button type="submit">Resolve verified reward funding</Button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
