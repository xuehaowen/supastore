import { adminQueueReturnContext } from "@/application/common/admin-return-context";
import { NativeSelect } from "@supastore/ui/native-select";
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
            {view === "fulfillment" && (
              <form method="get" className="admin-filter-bar">
                <Field
                  name="q"
                  label="Search fulfillment"
                  value={query.q}
                  required={false}
                />
                <label>
                  Work queue
                  <NativeSelect
                    name="work"
                    defaultValue={query.work ?? "active"}
                  >
                    <option value="active">All outstanding work</option>
                    <option value="prepare">To prepare</option>
                    <option value="ready">Ready for pickup</option>
                    <option value="transit">In transit</option>
                    <option value="completed">Completed history</option>
                    <option value="all">All operations</option>
                  </NativeSelect>
                </label>
                <Button type="submit">Filter fulfillment</Button>
              </form>
            )}

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
              .map((o) => {
                const status = data.fulfillmentRows.find(
                  (row) => row.orderId === o.id,
                )?.status;
                const partial = data.partialShipmentOrderIds.includes(o.id);
                const stage =
                  o.lifecycleStatus === "completed"
                    ? "Completed"
                    : o.lifecycleStatus !== "confirmed"
                      ? o.lifecycleStatus.replaceAll("_", " ")
                      : partial
                        ? "Partially dispatched"
                        : status === "shipped"
                          ? "In transit"
                          : status === "ready_for_pickup"
                            ? "Ready for pickup"
                            : "To prepare";
                const nextAction =
                  o.lifecycleStatus !== "confirmed"
                    ? "View order & fulfillment"
                    : partial
                      ? "Dispatch remaining units"
                      : status === "shipped"
                        ? "Record delivery"
                        : o.fulfillmentType === "pickup"
                          ? status === "ready_for_pickup"
                            ? "Complete pickup handoff"
                            : "Prepare pickup"
                          : "Prepare shipment";
                return (
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
                      {view === "fulfillment" && (
                        <span className="ml-2 rounded border px-2 py-1 text-sm">
                          {stage} · Next: {nextAction}
                        </span>
                      )}
                    </summary>
                    <p>{o.guestEmail}</p>
                    {view === "fulfillment" && (
                      <p>
                        <a
                          className="admin-edit-link"
                          href={`/admin/orders/${o.id}?back=${encodeURIComponent(adminQueueReturnContext("/admin/fulfillment", { ...query, manage: undefined }))}`}
                        >
                          {nextAction}
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
                );
              })}
          </section>
        </AdminDialog>
      )}
    </>
  );
}
