import { AdminDialog } from "@/app/admin/admin-dialog";
import type { QuoteTerms } from "@/application/use-cases/get-quote";
import { Notice } from "@/app/components";
import { EvidenceImage } from "./evidence-image";
import { PaymentReview } from "./payment-review";
import { adminQueueReturnContext } from "@/application/common/admin-return-context";
import { Badge } from "@supastore/ui/badge";
import { ExpandableTableRow } from "@supastore/ui/expandable-table-row";
import { Button } from "@supastore/ui/button";
import { Input } from "@supastore/ui/input";
import { NativeSelect } from "@supastore/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@supastore/ui/table";
import { money } from "@/infrastructure/web";
import type { OperationsScreenProps } from "./operations-types";
import { QueuePagination } from "./queue-pagination";
export function PaymentsView(props: OperationsScreenProps) {
  const { data, query, view, returnTo } = props;
  const { paymentRows, evidence, evidenceHasNext, store } = data;
  const {
    paymentSearch,
    paymentStatus,
    paymentType,
    paymentPage,
    evidencePage,
  } = props.filters;

  return (
    <>
      {view === "payments" && (
        <>
          <form method="get" className="admin-filter-bar payment-filter-bar">
            <label>
              Search payments
              <Input
                name="paymentQ"
                defaultValue={paymentSearch}
                placeholder="Customer, order, or reference"
              />
            </label>
            <label>
              Order status
              <NativeSelect name="paymentStatus" defaultValue={paymentStatus}>
                <option value="">All statuses</option>
                <option value="unpaid">Unpaid</option>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </NativeSelect>
            </label>
            <label>
              Payment type
              <NativeSelect name="paymentType" defaultValue={paymentType}>
                <option value="">All types</option>
                <option value="cash">Cash</option>
                <option value="zelle">Zelle</option>
                <option value="venmo">Venmo</option>
                <option value="other">Other</option>
              </NativeSelect>
            </label>
            <Button type="submit">Filter</Button>
          </form>
          <section className="panel">
            <h2>Payment ledger</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <span className="sr-only">Payment details</span>
                  </TableHead>
                  <TableHead>Payment reference</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Order status</TableHead>
                  <TableHead>Payment type</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentRows.slice(0, 50).map(({ receipt, order, account }) => (
                  <ExpandableTableRow
                    key={receipt.id}
                    columnCount={11}
                    detailsLabel={`Payment details for ${receipt.normalizedReference}`}
                    expandLabel={`Show payment ${receipt.normalizedReference}`}
                    collapseLabel={`Hide payment ${receipt.normalizedReference}`}
                    details={
                      <div className="space-y-4">
                        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          <div>
                            <dt className="text-muted-foreground">
                              Original reference
                            </dt>
                            <dd className="break-words">
                              {receipt.rawReference}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">
                              Receiving account
                            </dt>
                            <dd>
                              {account.accountName} ·{" "}
                              {account.accountIdentifier}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">
                              Recorded at
                            </dt>
                            <dd>
                              <time dateTime={receipt.createdAt.toISOString()}>
                                {receipt.createdAt.toLocaleString("en-US", {
                                  timeZone: store?.timezone ?? "UTC",
                                  timeZoneName: "short",
                                })}
                              </time>
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">
                              Order total
                            </dt>
                            <dd>
                              {money(
                                order.purchaseTotalCents,
                                store?.currency,
                                store?.precision,
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">
                              Store credit applied
                            </dt>
                            <dd>
                              {money(
                                order.creditAppliedCents,
                                store?.currency,
                                store?.precision,
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">
                              Fulfillment
                            </dt>
                            <dd className="capitalize">
                              {order.fulfillmentType.replaceAll("_", " ")}
                            </dd>
                          </div>
                        </dl>
                        <a
                          className="admin-edit-link"
                          href={`/admin/orders/${order.id}`}
                        >
                          View order {order.referenceCode}
                        </a>
                      </div>
                    }
                  >
                    <TableCell>
                      <strong>{receipt.normalizedReference}</strong>
                    </TableCell>
                    <TableCell>{order.referenceCode}</TableCell>
                    <TableCell>{order.guestName}</TableCell>
                    <TableCell>{order.guestEmail}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          order.lifecycleStatus === "completed" ||
                          order.lifecycleStatus === "confirmed"
                            ? "default"
                            : order.lifecycleStatus === "cancelled"
                              ? "destructive"
                              : "outline"
                        }
                      >
                        {order.lifecycleStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="capitalize">
                      {account.accountType}
                    </TableCell>
                    <TableCell>{account.accountName}</TableCell>
                    <TableCell>
                      {money(
                        receipt.amountCents,
                        store?.currency,
                        store?.precision,
                      )}
                    </TableCell>
                    <TableCell>
                      <time dateTime={receipt.createdAt.toISOString()}>
                        {receipt.createdAt.toLocaleDateString("en-US", {
                          timeZone: "UTC",
                        })}
                      </time>
                    </TableCell>
                    <TableCell className="text-right">
                      <a
                        className="admin-edit-link"
                        href={`${adminQueueReturnContext("/admin/payments", { ...query, managePayment: order.id })}#payment-${order.id}`}
                      >
                        Manage
                      </a>
                    </TableCell>
                  </ExpandableTableRow>
                ))}
              </TableBody>
            </Table>
            {paymentRows.length === 0 && (
              <p className="admin-empty">No payments match these filters.</p>
            )}
            <nav className="admin-pagination" aria-label="Payment pages">
              {paymentPage > 1 && (
                <a
                  href={`/admin/payments?paymentQ=${encodeURIComponent(paymentSearch)}&paymentStatus=${paymentStatus}&paymentType=${paymentType}&paymentPage=${paymentPage - 1}`}
                >
                  ← Previous
                </a>
              )}
              {paymentRows.length > 50 && (
                <a
                  href={`/admin/payments?paymentQ=${encodeURIComponent(paymentSearch)}&paymentStatus=${paymentStatus}&paymentType=${paymentType}&paymentPage=${paymentPage + 1}`}
                >
                  Next →
                </a>
              )}
            </nav>
          </section>
        </>
      )}
      {view === "payments" && (
        <section id="evidence">
          <h2>Payment evidence review</h2>
          <QueuePagination
            query={query}
            path={returnTo}
            parameter="evidencePage"
            page={evidencePage}
            hasNext={evidenceHasNext}
          />
          {evidence.length === 0 && (
            <p className="admin-empty">No submitted payment evidence.</p>
          )}
          <div className="evidence-grid">
            {evidence.map((item) => {
              const order = item.order;
              const label = order.referenceCode;
              const terms = order.termsSnapshot as QuoteTerms;
              const currency = terms.currency ?? store?.currency ?? "USD";
              const precision = terms.precision ?? store?.precision ?? 2;
              const reviewReturnTo = adminQueueReturnContext(
                "/admin/payments",
                { ...query, reviewEvidence: item.id },
              );
              const recorded = data.evidenceReceipts.filter(
                (receipt) => receipt.orderId === order.id,
              );
              return (
                <article className="evidence-card" key={item.id}>
                  <a
                    href={reviewReturnTo}
                    aria-label={`Review payment evidence for ${label}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- authenticated evidence redirects cannot use the image optimizer */}
                    <img
                      src={`/api/evidence/${item.id}`}
                      alt={`Payment evidence submitted for order ${label}`}
                    />
                  </a>
                  <div>
                    <strong>{label}</strong>
                    <span>{order.guestName}</span>
                    <Badge variant="outline">{order.lifecycleStatus}</Badge>
                    <span>
                      {money(order.purchaseTotalCents, currency, precision)}
                    </span>
                    <AdminDialog
                      wide
                      defaultOpen={query.reviewEvidence === item.id}
                      trigger="Review evidence"
                      title={`Payment evidence · ${label}`}
                      description="Compare this image with the receiving account and recorded amount before confirming payment."
                    >
                      <Notice
                        error={
                          query.reviewEvidence === item.id
                            ? query.error
                            : undefined
                        }
                      />
                      <div className="payment-evidence-workspace">
                        <EvidenceImage id={item.id} label={label} />
                        <div>
                          <h3>Order details · {label}</h3>
                          <p>
                            <strong>{order.guestName}</strong>
                            <br />
                            {order.guestEmail}
                          </p>
                          <Badge variant="outline">
                            {order.lifecycleStatus}
                          </Badge>
                          <p>
                            Placed{" "}
                            <time dateTime={order.createdAt.toISOString()}>
                              {order.createdAt.toLocaleString("en-US", {
                                timeZone: store?.timezone ?? "UTC",
                                timeZoneName: "short",
                              })}
                            </time>
                          </p>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Item</TableHead>
                                <TableHead>Quantity</TableHead>
                                <TableHead>Unit price</TableHead>
                                <TableHead>Line total</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {data.evidenceOrderItems
                                .filter((line) => line.orderId === order.id)
                                .map((line) => (
                                  <TableRow key={line.id}>
                                    <TableCell>
                                      {line.name}
                                      <p>{line.catalogSnapshot.sku}</p>
                                    </TableCell>
                                    <TableCell>{line.quantity}</TableCell>
                                    <TableCell>
                                      {money(
                                        line.unitPriceCents,
                                        currency,
                                        precision,
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      {money(
                                        line.lineTotalCents,
                                        currency,
                                        precision,
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                            </TableBody>
                          </Table>
                          <p>
                            Order total:{" "}
                            {money(
                              order.purchaseTotalCents,
                              currency,
                              precision,
                            )}
                            <br />
                            Store credit:{" "}
                            {money(
                              order.creditAppliedCents,
                              currency,
                              precision,
                            )}
                            <br />
                            External payment total:{" "}
                            {money(
                              order.purchaseTotalCents -
                                order.creditAppliedCents,
                              currency,
                              precision,
                            )}
                          </p>
                          <h4>Fulfillment</h4>
                          <p>{order.fulfillmentType.replaceAll("_", " ")}</p>
                          {order.pickupLocationName && (
                            <p>{order.pickupLocationName}</p>
                          )}
                          {order.pickupTime && <p>{order.pickupTime}</p>}
                          {order.shippingAddressSnapshot !== null &&
                            typeof order.shippingAddressSnapshot ===
                              "object" && (
                              <address>
                                {Object.entries(order.shippingAddressSnapshot)
                                  .filter(
                                    ([key, value]) =>
                                      [
                                        "address",
                                        "region",
                                        "postalCode",
                                        "country",
                                      ].includes(key) &&
                                      typeof value === "string" &&
                                      value,
                                  )
                                  .map(([key, value]) => (
                                    <div key={key}>{String(value)}</div>
                                  ))}
                              </address>
                            )}
                          <PaymentReview
                            order={order}
                            accounts={data.accounts}
                            currency={currency}
                            precision={precision}
                            returnTo={reviewReturnTo}
                            receiptSummary={
                              recorded.length ? (
                                <div>
                                  <h4>Recorded receipts</h4>
                                  {recorded.map((receipt) => (
                                    <p key={receipt.id}>
                                      {receipt.rawReference} ·{" "}
                                      {money(
                                        receipt.amountCents,
                                        currency,
                                        precision,
                                      )}
                                    </p>
                                  ))}
                                  <p>
                                    Receipts are shown before any corrections or
                                    returns.
                                  </p>
                                </div>
                              ) : (
                                <p>No receipts recorded yet.</p>
                              )
                            }
                          />
                          <a
                            className="admin-edit-link"
                            href={`/admin/orders/${order.id}`}
                          >
                            Full order details
                          </a>
                        </div>
                      </div>
                    </AdminDialog>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
