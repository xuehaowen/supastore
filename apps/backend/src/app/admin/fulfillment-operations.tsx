import { money } from "@/infrastructure/web";
import { CurrencyField } from "@/app/admin/currency-field";
import {
  authorizeOrderRefund,
  authorizeOrderSurplusReturn,
  cancelAdminOrder,
  correctOrderFulfillment,
  correctRecordedReceipt,
} from "@/app/actions";
import { AdminDialog } from "@/app/admin/admin-dialog";
import { Field, Hidden } from "@/app/components";
import { Button } from "@supastore/ui/button";
import type { OperationsScreenProps } from "./operations-types";
import { QueuePagination } from "./queue-pagination";
export function FulfillmentOperations(props: OperationsScreenProps) {
  const { data, query, view, returnTo } = props;
  const { member, receipts } = data;
  const rows = data.managedOrders.length ? data.managedOrders : data.rows;
  const { fulfillmentPage } = props.filters;

  return (
    <>
      {(view === "fulfillment" ||
        (view === "payments" && query.managePayment)) && (
        <AdminDialog
          inline={view === "fulfillment"}
          defaultOpen={view === "payments"}
          title="Manage payment"
          description="Review the receipt and perform authorized payment corrections or returns."
        >
          <section id="ready" className="admin-operation-dialog">
            <h2>
              {view === "payments"
                ? "Receipt and adjustments"
                : "Fulfillment operations"}
            </h2>
            {view === "fulfillment" && (
              <QueuePagination
                query={{ ...query, manage: undefined }}
                path={returnTo}
                parameter="fulfillmentPage"
                page={fulfillmentPage}
                hasNext={data.fulfillmentHasNext}
              />
            )}
            {!rows.some(
              (order) =>
                order.lifecycleStatus === "confirmed" ||
                order.lifecycleStatus === "completed" ||
                (member.role === "owner" &&
                  receipts.some((receipt) => receipt.orderId === order.id)),
            ) && (
              <p className="admin-empty">
                No fulfillment or payment operations to review.
              </p>
            )}
            {rows
              .filter(
                (o) =>
                  (view !== "payments" || o.id === query.managePayment) &&
                  (o.lifecycleStatus === "confirmed" ||
                    o.lifecycleStatus === "completed" ||
                    (member.role === "owner" &&
                      receipts.some((receipt) => receipt.orderId === o.id))),
              )
              .map((o) => (
                <details
                  className="panel"
                  id={
                    view === "payments"
                      ? `payment-${o.id}`
                      : `order-fulfillment-${o.id}`
                  }
                  key={o.id}
                  open={query.manage === o.id || query.managePayment === o.id}
                >
                  <summary>
                    {o.referenceCode} · {o.guestName} · {o.fulfillmentType}
                  </summary>
                  <p>{o.guestEmail}</p>
                  {view === "fulfillment" && (
                    <p>
                      <a
                        className="admin-edit-link"
                        href={`/admin/orders/${o.id}`}
                      >
                        View order & fulfillment
                      </a>
                    </p>
                  )}
                  {view === "fulfillment" &&
                    member.role === "owner" &&
                    o.lifecycleStatus === "confirmed" && (
                      <form action={cancelAdminOrder} className="mt-2">
                        <Hidden name="returnTo" value={returnTo} />
                        <Hidden name="orderId" value={o.id} />
                        <Field label="Cancellation reason" name="reason" />
                        <Button type="submit" variant="outline">
                          Cancel order
                        </Button>
                      </form>
                    )}
                  {member.role === "owner" &&
                    receipts
                      .filter((receipt) => receipt.orderId === o.id)
                      .map((receipt) => (
                        <div className="mt-4 border-t pt-4" key={receipt.id}>
                          <p>
                            Receipt: {receipt.normalizedReference} ·{" "}
                            {money(
                              receipt.amountCents,
                              data.store?.currency,
                              data.store?.precision,
                            )}
                          </p>
                          {(o.lifecycleStatus === "confirmed" ||
                            o.lifecycleStatus === "completed") && (
                            <form
                              action={authorizeOrderRefund}
                              className="mt-2"
                            >
                              <Hidden name="returnTo" value={returnTo} />
                              <Hidden name="orderId" value={o.id} />
                              <Hidden name="receiptId" value={receipt.id} />
                              <CurrencyField
                                label="Refund amount"
                                name="amount"
                              />
                              <Field label="Refund reason" name="reason" />
                              <Button type="submit" variant="outline">
                                Authorize refund
                              </Button>
                            </form>
                          )}
                          <form
                            action={authorizeOrderSurplusReturn}
                            className="mt-2"
                          >
                            <Hidden name="returnTo" value={returnTo} />
                            <Hidden name="orderId" value={o.id} />
                            <Hidden name="receiptId" value={receipt.id} />
                            <CurrencyField
                              label="Surplus return amount"
                              name="amount"
                            />
                            <Field label="Return reason" name="reason" />
                            <Button type="submit" variant="outline">
                              Authorize surplus return
                            </Button>
                          </form>
                          <form
                            action={correctRecordedReceipt}
                            className="mt-2"
                          >
                            <Hidden name="returnTo" value={returnTo} />
                            <Hidden name="receiptId" value={receipt.id} />
                            <CurrencyField
                              signed
                              label="Correction delta"
                              name="delta"
                            />
                            <Field label="Correction reason" name="reason" />
                            <Field label="Investigation notes" name="notes" />
                            <Button type="submit" variant="outline">
                              Open receipt correction
                            </Button>
                          </form>
                        </div>
                      ))}
                  {view === "fulfillment" && (
                    <form action={correctOrderFulfillment} className="mt-2">
                      <Hidden name="returnTo" value={returnTo} />
                      <Hidden name="orderId" value={o.id} />
                      <Field
                        label="Corrected carrier / delivery method"
                        name="carrier"
                      />
                      <Field
                        label="Corrected tracking number"
                        name="trackingNumber"
                      />
                      <Field label="Correction reason" name="reason" />
                      <Button type="submit" variant="outline">
                        Correct fulfillment details
                      </Button>
                    </form>
                  )}
                </details>
              ))}
          </section>
        </AdminDialog>
      )}
    </>
  );
}
