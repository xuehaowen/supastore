import { adminListReturnContext } from "@/application/common/admin-return-context";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { staffIdentity, money } from "@/infrastructure/web";
import { orderItemName } from "@/domain/catalog/order-item-name";
import { AdminNav } from "@/app/admin/admin-nav";
import { AdminDialog } from "@/app/admin/admin-dialog";
import { EvidenceImage } from "@/app/admin/evidence-image";
import { Field, Hidden, Notice } from "@/app/components";
import { Button } from "@supastore/ui/button";
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
import { cancelAdminOrder } from "@/app/actions";
import { getAdminOrderDetail } from "@/application/use-cases/orders/get-admin-order-detail";
import { OrderPaymentSection } from "./payment-section";
import { OrderFulfillmentSection } from "./fulfillment-section";
import { OrderRefundSection } from "./refund-section";
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
  const data = await getAdminOrderDetail({ staffUserId: staff, orderId: id });
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
            <OrderPaymentSection
              data={data}
              terms={terms}
              format={format}
              identity={identity}
            />
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
            <OrderFulfillmentSection
              data={data}
              identity={identity}
              detailReturnTo={detailReturnTo}
            />
            <OrderRefundSection
              data={data}
              terms={terms}
              format={format}
              identity={identity}
              detailReturnTo={detailReturnTo}
            />
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
