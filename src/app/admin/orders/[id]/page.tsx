import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { asc, desc, eq, inArray } from "drizzle-orm";
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
} from "@/infrastructure/db/schema";
import { staffIdentity, money } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { orderItemName } from "@/domain/catalog/order-item-name";
import { AdminNav } from "@/app/admin/admin-nav";
import { AdminDialog } from "@/app/admin/admin-dialog";
import { Field, Hidden, Notice } from "@/app/components";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  receivePayment,
  confirmPayment,
  cancelAdminOrder,
  fulfillConfirmedOrder,
} from "@/app/actions";
import { refundPurchaseAction } from "@/app/admin/credit-actions";
import type { QuoteTerms } from "@/application/use-cases/get-quote";
export default async function OrderDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const staff = await staffIdentity().catch(() => redirect("/admin/login"));
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const query = await searchParams;
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
      receipts,
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
      <Hidden name="returnTo" value={`/admin/orders/${id}`} />
    </>
  );
  return (
    <main className="admin">
      <AdminNav />
      <Link href="/admin/orders">← All orders</Link>
      <h1>{o.referenceCode}</h1>
      <p>
        {o.guestName} · {o.guestEmail} · {o.lifecycleStatus}
      </p>
      <Notice error={query.error} />
      {query.saved && <p role="status">Order updated.</p>}
      <section className="panel">
        <h2>Purchase & funding</h2>
        <p>
          Purchase total: {format(o.purchaseTotalCents)} · Net external
          received: {format(received)} · External amount due:{" "}
          {format(externalDue)}
        </p>
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
                  {data.stock.find((s) => s.orderItemId === i.id)?.status ||
                    "Untracked at placement"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <h3>Frozen sources</h3>
        {data.funding.map((f) => (
          <p key={f.id}>
            {f.creditEntryId ? "Store credit debit" : "External receipt"} ·{" "}
            {format(f.fundedAmountCents)}
          </p>
        ))}
      </section>
      {o.lifecycleStatus === "unpaid" && (
        <section className="panel">
          <h2>Payment</h2>
          <AdminDialog trigger="Record payment" title="Record actual payment">
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
              <Field
                name="amount"
                label="Actual received amount in minor units"
                type="number"
              />
              <Field name="reference" label="Actual payment reference" />
              <label>
                <input type="checkbox" name="verified" required />I verified the
                actual receiving account and amount.
              </label>
              <Button type="submit">Record receipt</Button>
            </form>
          </AdminDialog>
          <form action={confirmPayment}>
            {identity}
            <Button type="submit">Confirm exact payment</Button>
          </form>
        </section>
      )}
      <section className="panel">
        <h2>Fulfillment</h2>
        <p>
          {data.fulfillment?.status.replaceAll("_", " ")} ·{" "}
          {data.fulfillment?.carrier || ""} ·{" "}
          {data.fulfillment?.trackingNumber || ""}
        </p>
        {o.lifecycleStatus === "confirmed" &&
          o.fulfillmentType === "shipping" && (
            <AdminDialog
              trigger="Complete shipping handoff"
              title="Complete shipping handoff"
              description="This records physical handoff and consumes reserved stock once. Resolve stock shortages first."
            >
              <form action={fulfillConfirmedOrder}>
                {identity}
                <Field name="carrier" label="Carrier or delivery method" />
                <Field
                  name="trackingNumber"
                  label="Tracking number"
                  required={false}
                />
                <Button type="submit">Complete handoff</Button>
              </form>
            </AdminDialog>
          )}
        <Link href="/admin/fulfillment">Pickup & fulfillment operations</Link>
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
                <p>Remaining purchase entitlement: {format(remainingRefund)}</p>
                <Field
                  name="amountCents"
                  label="Refund amount in minor units"
                  type="number"
                />
                <Field name="reason" label="Refund reason" />
                <Button type="submit">Authorize source-aware refund</Button>
              </form>
            </AdminDialog>
          )}
        <Link href={`/admin/payments?managePayment=${id}`}>
          Payouts, surplus returns & corrections
        </Link>
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
        {data.activity.map((a) => (
          <p key={a.id}>
            {a.createdAt.toLocaleString("en-US", { timeZone: "UTC" })} UTC ·{" "}
            {a.action} · {a.reason || ""}
          </p>
        ))}
      </section>
    </main>
  );
}
