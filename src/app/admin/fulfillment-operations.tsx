import {
  authorizeOrderRefund,
  authorizeOrderSurplusReturn,
  cancelAdminOrder,
  completeOrderPickup,
  correctOrderFulfillment,
  correctRecordedReceipt,
  fulfillConfirmedOrder,
  markOrderReady,
} from "@/app/actions";
import { AdminDialog } from "@/app/admin/admin-dialog";
import { Field, Hidden } from "@/app/components";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
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
                  {view === "fulfillment" &&
                    o.lifecycleStatus === "confirmed" &&
                    (o.fulfillmentType === "pickup" ? (
                      <>
                        <form action={markOrderReady} className="mt-2">
                          <Hidden name="returnTo" value={returnTo} />
                          <Hidden name="orderId" value={o.id} />
                          <Button type="submit" variant="outline">
                            Mark ready for pickup
                          </Button>
                        </form>
                        <form action={completeOrderPickup} className="mt-2">
                          <Hidden name="returnTo" value={returnTo} />
                          <Hidden name="orderId" value={o.id} />
                          <Field
                            label="Recipient / authorized recipient"
                            name="handoffActor"
                          />
                          <NativeSelect
                            name="verificationMethod"
                            defaultValue="scoped_order_page"
                          >
                            <option value="scoped_order_page">
                              Scoped order page
                            </option>
                            <option value="owner_assisted">
                              Owner-assisted verification
                            </option>
                          </NativeSelect>
                          <Button type="submit" variant="outline">
                            Complete pickup handoff
                          </Button>
                        </form>
                      </>
                    ) : (
                      <form action={fulfillConfirmedOrder} className="mt-2">
                        <Hidden name="returnTo" value={returnTo} />
                        <Hidden name="orderId" value={o.id} />
                        <Field label="Carrier" name="carrier" />
                        <Field label="Tracking number" name="trackingNumber" />
                        <Button type="submit" variant="outline">
                          Mark shipped / delivered
                        </Button>
                      </form>
                    ))}
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
                            {receipt.amountCents} minor units
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
                              <Field
                                label="Refund amount (minor units)"
                                name="amount"
                                type="number"
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
                            <Field
                              label="Surplus return amount (minor units)"
                              name="amount"
                              type="number"
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
                            <Field
                              label="Correction delta (minor units)"
                              name="delta"
                              type="number"
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
                      <Hidden name="returnTo" value={`/admin/${view}`} />
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
