import { adminListReturnContext } from "@/application/common/admin-return-context";
import { shipmentLines } from "@/application/use-cases/fulfillment/shipments";
import { shipmentCoverageComplete } from "@/domain/shipment";
import { CurrencyField } from "@/app/admin/currency-field";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
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
import { staffIdentity, money } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { orderItemName } from "@/domain/catalog/order-item-name";
import { AdminNav } from "@/app/admin/admin-nav";
import { resolveRewardReviewAction } from "@/app/admin/reward-actions";
import { AdminDialog } from "@/app/admin/admin-dialog";
import { EvidenceImage } from "@/app/admin/evidence-image";
import { Field, Hidden, Notice } from "@/app/components";
import { Button } from "@supastore/ui/button";
import { Checkbox } from "@supastore/ui/checkbox";
import { NativeSelect } from "@supastore/ui/native-select";
import { Alert, AlertDescription } from "@supastore/ui/alert";
import { Badge } from "@supastore/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@supastore/ui/table";
import {
  receivePayment,
  confirmPayment,
  cancelAdminOrder,
  fulfillConfirmedOrder,
  dispatchConfirmedOrder,
  markOrderReady,
  completeOrderPickup,
  receiveCashPayment,
  proposeChange,
} from "@/app/actions";
import { refundPurchaseAction } from "@/app/admin/credit-actions";
import type { QuoteTerms } from "@/application/use-cases/get-quote";
export default async function OrderDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; back?: string }>;
}) {
  const staff = await staffIdentity().catch(() => redirect("/admin/login"));
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const query = await searchParams;
  const back = adminListReturnContext(query.back ?? "/admin/orders");
  const detailReturnTo =
    `/admin/orders/${id}` +
    (query.back ? `?back=${encodeURIComponent(back)}` : "");
  const data = await db.transaction(async (tx) => {
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
  if (!data) notFound();
  const o = data.order,
    terms = o.termsSnapshot as QuoteTerms;
  const format = (amount: number) =>
    money(amount, terms.currency, terms.precision);
  const received =
    data.receipts.reduce((sum, r) => sum + r.amountCents, 0) +
    data.corrections.reduce((sum, c) => sum + c.deltaAmountCents, 0) -
    data.allocations
      .filter((a) => a.paymentReturnId)
      .reduce((sum, a) => sum + a.settledAmountCents, 0);
  const externalDue =
    o.lifecycleStatus === "unpaid"
      ? Math.max(0, o.purchaseTotalCents - o.creditAppliedCents - received)
      : 0;
  const remainingRefund =
    o.purchaseTotalCents -
    data.refunds
      .filter((a) => a.kind === "purchase_refund")
      .reduce((sum, a) => sum + a.amountCents, 0);
  const identity = (
    <>
      <Hidden name="orderId" value={id} />
      <Hidden name="returnTo" value={detailReturnTo} />
    </>
  );
  return (
    <>
      <AdminNav />
      <main tabIndex={-1} id="admin-content" className="admin order-detail">
        <Link href={back}>
          {back.startsWith("/admin/fulfillment")
            ? "← Back to fulfillment"
            : "← All orders"}
        </Link>
        <div className="order-detail-heading">
          <div>
            <p className="eyebrow">Order details</p>
            <h1>{o.referenceCode}</h1>
            <p>
              Placed {o.createdAt.toLocaleString("en-US", { timeZone: "UTC" })}{" "}
              UTC
            </p>
          </div>
          <Link href={`/admin/orders/${id}/packing-slip`}>
            Print packing slip
          </Link>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <span>
            {o.guestName} · {o.guestEmail}
          </span>
          <Badge
            variant={
              o.lifecycleStatus === "completed" ||
              o.lifecycleStatus === "confirmed"
                ? "default"
                : o.lifecycleStatus === "cancelled"
                  ? "destructive"
                  : "outline"
            }
          >
            {o.lifecycleStatus}
          </Badge>
        </div>
        <Notice error={query.error} />
        {query.saved && (
          <Alert>
            <AlertDescription>Order updated.</AlertDescription>
          </Alert>
        )}
        <div className="order-detail-layout">
          <div className="order-detail-main">
            <section className="panel">
              <h2>Items & payment summary</h2>
              <dl className="order-money-summary">
                <div>
                  <dt>Order total</dt>
                  <dd>{format(o.purchaseTotalCents)}</dd>
                </div>
                <div>
                  <dt>Net external received</dt>
                  <dd>{format(received)}</dd>
                </div>
                <div>
                  <dt>External amount due</dt>
                  <dd>{format(externalDue)}</dd>
                </div>
              </dl>
              {data.credit && (
                <p>
                  Store credit: {format(data.credit.amountCents)} ·{" "}
                  {data.credit.status} ·{" "}
                  <Link href={`/admin/store-credit/${data.credit.accountId}`}>
                    Credit ledger
                  </Link>
                </p>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Unit price</TableHead>
                    <TableHead>Stock reservation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>
                        {orderItemName(i, data.quote?.itemsSnapshot)}
                        <p>{i.catalogSnapshot.sku || ""}</p>
                      </TableCell>
                      <TableCell>{i.quantity}</TableCell>
                      <TableCell>{format(i.unitPriceCents)}</TableCell>
                      <TableCell>
                        {data.stock.find((s) => s.orderItemId === i.id)
                          ?.status || "Untracked at placement"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <h3>Payment sources at confirmation</h3>
              {data.funding.map((f) => (
                <p key={f.id}>
                  {f.creditEntryId ? "Store credit debit" : "External receipt"}{" "}
                  · {format(f.fundedAmountCents)}
                </p>
              ))}
            </section>
            {["unpaid", "cancelled"].includes(o.lifecycleStatus) && (
              <section className="panel">
                <h2>Payment</h2>
                {o.lifecycleStatus === "cancelled" && (
                  <p>
                    This order is cancelled. Record late payments for return;
                    recording a receipt does not reopen the order.
                  </p>
                )}
                <AdminDialog
                  wide={data.evidence.length > 0}
                  trigger="Record payment"
                  title="Record actual payment"
                >
                  <div
                    className={
                      data.evidence.length
                        ? "payment-evidence-workspace"
                        : undefined
                    }
                  >
                    {data.evidence.length > 0 && (
                      <div>
                        <h3>Submitted evidence</h3>
                        {data.evidence.map((item) => (
                          <EvidenceImage
                            key={item.id}
                            id={item.id}
                            label={o.referenceCode}
                          />
                        ))}
                      </div>
                    )}
                    <form action={receivePayment}>
                      {identity}
                      <label>
                        Receiving account
                        <NativeSelect name="accountId">
                          {data.accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.accountName}
                            </option>
                          ))}
                        </NativeSelect>
                      </label>
                      <CurrencyField
                        currency={terms.currency}
                        precision={terms.precision}
                        name="amount"
                        label="Actual received amount"
                      />
                      <Field
                        name="reference"
                        label="Actual payment reference"
                      />
                      <label className="flex items-center gap-2">
                        <Checkbox name="verified" required />I verified the
                        actual receiving account and amount.
                      </label>
                      <Button type="submit">Record receipt</Button>
                    </form>
                  </div>
                </AdminDialog>
                <AdminDialog
                  trigger="Record cash payment"
                  title="Record cash payment"
                >
                  <form action={receiveCashPayment}>
                    {identity}
                    <label>
                      Cash account
                      <NativeSelect name="accountId" required defaultValue="">
                        <option value="" disabled>
                          Choose a cash account
                        </option>
                        {data.accounts
                          .filter((a) => a.isActive && a.accountType === "cash")
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.accountName}
                            </option>
                          ))}
                      </NativeSelect>
                    </label>
                    {!data.accounts.some(
                      (a) => a.isActive && a.accountType === "cash",
                    ) && (
                      <p>
                        No active cash account. Ask an owner to add one in
                        Settings.
                      </p>
                    )}
                    <CurrencyField
                      name="amount"
                      label="Cash amount"
                      currency={terms.currency}
                      precision={terms.precision}
                    />
                    <CurrencyField
                      name="tenderedAmount"
                      label="Tendered amount"
                      currency={terms.currency}
                      precision={terms.precision}
                    />
                    <Field name="payerName" label="Payer name" />
                    <Button
                      type="submit"
                      disabled={
                        !data.accounts.some(
                          (a) => a.isActive && a.accountType === "cash",
                        )
                      }
                    >
                      Record cash receipt
                    </Button>
                  </form>
                </AdminDialog>
                {o.lifecycleStatus === "unpaid" && (
                  <form action={confirmPayment}>
                    {identity}
                    <Button type="submit">Confirm exact payment</Button>
                  </form>
                )}
                {o.lifecycleStatus === "unpaid" &&
                  data.identity.role === "owner" && (
                    <AdminDialog
                      trigger="Propose new terms"
                      title="Propose new order total"
                      description="The customer must accept the proposed total before payment confirmation."
                    >
                      <form action={proposeChange}>
                        {identity}
                        <CurrencyField
                          name="total"
                          label="Proposed total"
                          currency={terms.currency}
                          precision={terms.precision}
                        />
                        <Field name="reason" label="Reason" />
                        <Button type="submit">Propose new terms</Button>
                      </form>
                    </AdminDialog>
                  )}
              </section>
            )}
            <section className="panel" aria-labelledby="order-evidence-heading">
              <h2 id="order-evidence-heading">Payment evidence & receipts</h2>
              {data.evidence.length === 0 && (
                <p>No payment evidence submitted.</p>
              )}
              <div className="evidence-grid">
                {data.evidence.map((item) => (
                  <article className="evidence-card" key={item.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- private authenticated evidence */}
                    <img
                      src={`/api/evidence/${item.id}`}
                      alt={`Payment evidence submitted for order ${o.referenceCode}`}
                    />
                    <div>
                      <AdminDialog
                        wide
                        trigger="Expand evidence"
                        title={`Payment evidence · ${o.referenceCode}`}
                      >
                        <EvidenceImage id={item.id} label={o.referenceCode} />
                      </AdminDialog>
                    </div>
                  </article>
                ))}
              </div>
              <h3>Recorded receipts</h3>
              {data.receipts.length === 0 && <p>No receipts recorded yet.</p>}
              {data.receipts.map((receipt) => (
                <p key={receipt.id}>
                  {receipt.rawReference} · {format(receipt.amountCents)}
                </p>
              ))}
              {data.receipts.length > 0 && (
                <p>
                  Receipt amounts are shown before corrections and returns. The
                  payment summary shows net external receipts.
                </p>
              )}
            </section>
            <section className="panel">
              <h2>Fulfillment</h2>
              <Link
                href={`/admin/fulfillment/shipments?orderId=${id}&back=${encodeURIComponent(detailReturnTo)}`}
              >
                Manage partial shipments & reschedule booking
              </Link>
              <p>
                {data.fulfillment?.status.replaceAll("_", " ")} ·{" "}
                {data.fulfillment?.carrier || ""} ·{" "}
                {data.fulfillment?.trackingNumber || ""}
              </p>
              {data.fulfillment?.status === "shipped" &&
                !shipmentCoverageComplete(data.items, data.shipmentLines) && (
                  <p>
                    Partially dispatched.{" "}
                    <Link
                      href={`/admin/fulfillment/shipments?orderId=${id}&back=${encodeURIComponent(detailReturnTo)}`}
                    >
                      Dispatch remaining units
                    </Link>
                  </p>
                )}
              {o.lifecycleStatus === "confirmed" &&
                o.fulfillmentType === "shipping" &&
                !(
                  data.fulfillment?.status === "shipped" &&
                  !shipmentCoverageComplete(data.items, data.shipmentLines)
                ) && (
                  <AdminDialog
                    trigger={
                      data.fulfillment?.status === "shipped"
                        ? "Record delivery"
                        : "Dispatch shipment"
                    }
                    title={
                      data.fulfillment?.status === "shipped"
                        ? "Record completed delivery"
                        : "Dispatch shipment"
                    }
                    description="Dispatch consumes stock once. Record delivery when the customer receives the order to release purchase rewards."
                  >
                    <form
                      action={
                        data.fulfillment?.status === "shipped"
                          ? fulfillConfirmedOrder
                          : dispatchConfirmedOrder
                      }
                    >
                      {identity}
                      <Field
                        name="carrier"
                        label="Carrier or delivery method"
                        value={data.fulfillment?.carrier ?? undefined}
                      />
                      <Field
                        name="trackingNumber"
                        label="Tracking number"
                        value={data.fulfillment?.trackingNumber ?? undefined}
                        required={false}
                      />
                      <Button type="submit">
                        {data.fulfillment?.status === "shipped"
                          ? "Record delivery"
                          : "Dispatch shipment"}
                      </Button>
                    </form>
                  </AdminDialog>
                )}
              {o.lifecycleStatus === "confirmed" &&
                o.fulfillmentType === "pickup" && (
                  <div className="grid gap-4">
                    {data.fulfillment?.status !== "ready_for_pickup" && (
                      <form action={markOrderReady}>
                        {identity}
                        <Button type="submit">Mark ready for pickup</Button>
                      </form>
                    )}
                    {data.fulfillment?.status === "ready_for_pickup" ? (
                      <AdminDialog
                        trigger="Complete pickup handoff"
                        title="Verify pickup recipient"
                      >
                        <form action={completeOrderPickup}>
                          {identity}
                          <Field
                            label="Recipient / authorized recipient"
                            name="handoffActor"
                          />
                          <label>
                            Verification method
                            <NativeSelect
                              name="verificationMethod"
                              defaultValue="scoped_order_page"
                            >
                              <option value="scoped_order_page">
                                Customer order page checked
                              </option>
                              <option value="owner_assisted">
                                Owner-assisted verification
                              </option>
                            </NativeSelect>
                          </label>
                          <Button type="submit">Complete pickup handoff</Button>
                        </form>
                      </AdminDialog>
                    ) : (
                      <p>
                        Mark this order ready for pickup before completing the
                        handoff.
                      </p>
                    )}
                  </div>
                )}
              <Link href="/admin/fulfillment">All fulfillment work</Link>
            </section>
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
                      <p>
                        Remaining purchase entitlement:{" "}
                        {format(remainingRefund)}
                      </p>
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
                            Enter which merchandise, tax, and fulfillment
                            amounts are refunded. Leave all zero to allocate
                            proportionally. Detailed amounts must add up to the
                            refund total and retain their original payment
                            source.
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
                      <Button type="submit">
                        Authorize source-aware refund
                      </Button>
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
                      Reward funding requires review after a receipt correction.
                      Pending rewards are suspended; issued rewards have been
                      conservatively reversed. Original-source refund
                      entitlements remain recorded.
                    </AlertDescription>
                  </Alert>
                  {data.identity.role === "owner" && (
                    <form action={resolveRewardReviewAction}>
                      <Hidden name="returnTo" value={detailReturnTo} />
                      <Hidden name="orderId" value={o.id} />
                      <Hidden name="requestKey" value={randomUUID()} />
                      <p>
                        Verify and correct every original frozen receipt first.
                        Another payment cannot replace a corrected source.
                        Resolving review restores only the supported accepted
                        reward, including its debt history.
                      </p>
                      <Field
                        name="reason"
                        label="Verified funding evidence and review reason"
                      />
                      <Button type="submit">
                        Resolve verified reward funding
                      </Button>
                    </form>
                  )}
                </div>
              )}
            </section>
            {data.identity.role === "owner" &&
              ["unpaid", "confirmed"].includes(o.lifecycleStatus) && (
                <section className="panel">
                  <AdminDialog
                    trigger="Cancel order"
                    title="Cancel order"
                    description="Release unconsumed stock and unpaid credit holds. Confirmed purchases create original-source refund obligations."
                  >
                    <form action={cancelAdminOrder}>
                      {identity}
                      <Field name="reason" label="Cancellation reason" />
                      <Button type="submit" variant="destructive">
                        Cancel order
                      </Button>
                    </form>
                  </AdminDialog>
                </section>
              )}
            <section className="panel">
              <h2>Order activity</h2>
              {data.activity.length === 0 && <p>No recorded activity yet.</p>}
              <ol className="order-activity-list">
                {data.activity.map((a) => (
                  <li key={a.id}>
                    <strong>{a.action.replaceAll("_", " ")}</strong>
                    <p>{a.reason || ""}</p>
                    <time dateTime={a.createdAt.toISOString()}>
                      {a.createdAt.toLocaleString("en-US", { timeZone: "UTC" })}{" "}
                      UTC
                    </time>
                  </li>
                ))}
              </ol>
            </section>
          </div>
          <aside className="order-detail-aside" aria-label="Order context">
            <section className="panel">
              <h2>Customer</h2>
              <p>
                <strong>{o.guestName}</strong>
              </p>
              <a href={`mailto:${o.guestEmail}`}>{o.guestEmail}</a>
              {o.customerId && (
                <p>
                  <Link href={`/admin/customers/${o.customerId}`}>
                    View customer
                  </Link>
                </p>
              )}
            </section>
            <section className="panel">
              <h2>Fulfillment details</h2>
              <p>{o.fulfillmentType.replaceAll("_", " ")}</p>
              <Badge variant="outline">
                {data.fulfillment?.status.replaceAll("_", " ") ?? "Not started"}
              </Badge>
              {o.shippingAddressSnapshot !== null &&
                typeof o.shippingAddressSnapshot === "object" && (
                  <address>
                    {Object.entries(o.shippingAddressSnapshot)
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
              {data.fulfillment?.carrier && (
                <p>Carrier: {data.fulfillment.carrier}</p>
              )}
              {data.fulfillment?.trackingNumber && (
                <p>Tracking: {data.fulfillment.trackingNumber}</p>
              )}
            </section>
            <section className="panel">
              <h2>Payment status</h2>
              <Badge variant="outline">
                {o.lifecycleStatus === "unpaid"
                  ? "Awaiting confirmation"
                  : o.lifecycleStatus === "cancelled"
                    ? "Order cancelled"
                    : "Confirmed"}
              </Badge>
              <dl>
                <dt>Store credit applied</dt>
                <dd>{format(o.creditAppliedCents)}</dd>
                <dt>Net external received</dt>
                <dd>{format(received)}</dd>
              </dl>
              <Link href={`/admin/payments?managePayment=${id}`}>
                Payment management
              </Link>
            </section>
          </aside>
        </div>
      </main>
    </>
  );
}
