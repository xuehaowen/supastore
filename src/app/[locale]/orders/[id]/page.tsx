import { trackOrder } from "@/application/use-cases/tracking";
import { orderToken, money } from "@/infrastructure/web";
import { UnauthorizedError } from "@/application/common/errors";
import { redirect } from "next/navigation";
import type { QuoteTerms } from "@/application/use-cases/get-quote";
import { CopyButton, Uploader } from "@/app/interactive";
import { Hidden, Notice } from "@/app/components";
import { acceptProposal } from "@/app/actions";
import { claimOrderAction } from "@/app/customer-actions";
import { requestReturnAction } from "@/app/return-actions";
import { randomUUID } from "node:crypto";
import { orderItemName } from "@/domain/catalog/order-item-name";
import { Input } from "@/components/ui/input";
import { Field } from "@/app/components";
export const metadata = { robots: { index: false, follow: false } };
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale, id } = await params;
  const query = await searchParams;
  const result = await trackOrder(id, await orderToken(id)).catch((error) => {
    if (error instanceof UnauthorizedError) redirect("/recover");
    throw error;
  });
  const {
    order,
    proposal,
    receivedCents,
    fulfillment,
    evidence,
    items,
    quoteItems,
    goodsReturns,
    returnItems,
  } = result;
  const returnableQuantities = new Map(items.map((item) => {
                const committed = returnItems
                  .filter(
                    (ri) =>
                      ri.orderItemId === item.id &&
                      goodsReturns.some(
                        (r) =>
                          r.id === ri.returnId &&
                          ["requested", "approved", "received"].includes(
                            r.status,
                          ),
                      ),
                  )
                  .reduce((sum, ri) => sum + ri.quantity, 0);
                const available = item.quantity - committed;
    return [item.id, available] as const;
  }));
  const terms = order.termsSnapshot as QuoteTerms;
  return (
    <section className="mx-auto my-12 min-h-[50vh] max-w-3xl">
      <p className="mb-6 text-[10px] font-bold tracking-[0.2em]">
        YOUR ORDER IS SAVED
      </p>
      <h1 className="mb-7 font-serif text-5xl tracking-[-0.045em]">
        {order.referenceCode}
      </h1>
      <Notice error={query.error} />
      {!order.customerId && (
        <form action={claimOrderAction} className="mb-5">
          <Hidden name="locale" value={locale} />
          <Hidden name="orderId" value={id} />
          <Button type="submit" variant="outline">
            Add to my account
          </Button>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in with a verified account first. This private order link is
            required to claim the order.
          </p>
        </form>
      )}
      <Badge variant="secondary" className="mb-6">
        {order.lifecycleStatus} · {fulfillment?.status.replaceAll("_", " ")}
      </Badge>
      <dl className="grid grid-cols-2 gap-4 border-t pt-5">
        <dt>Order total</dt>
        <dd className="m-0 text-right">
          {money(order.purchaseTotalCents, terms.currency, terms.precision)}
        </dd>
        <dt>Net external received</dt>
        <dd className="m-0 text-right">
          {money(receivedCents, terms.currency, terms.precision)}
        </dd>
        {order.creditAppliedCents > 0 && (
          <>
            <dt>Store credit applied</dt>
            <dd className="m-0 text-right">
              {money(order.creditAppliedCents, terms.currency, terms.precision)}
            </dd>
          </>
        )}
        <dt>Balance</dt>
        <dd className="m-0 text-right">
          {money(
            order.lifecycleStatus === "unpaid"
              ? Math.max(
                  0,
                  order.purchaseTotalCents -
                    order.creditAppliedCents -
                    receivedCents,
                )
              : 0,
            terms.currency,
            terms.precision,
          )}
        </dd>
      </dl>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Order items</CardTitle>
        </CardHeader>
        <CardContent>
          {items.map((item) => (
            <p key={item.id}>
              {orderItemName(item, quoteItems)} · {item.quantity} ×{" "}
              {money(item.unitPriceCents, terms.currency, terms.precision)}
            </p>
          ))}
        </CardContent>
      </Card>
      {result.refunds.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Refunds</CardTitle>
          </CardHeader>
          <CardContent>
            {result.refunds.map((r) => (
              <p key={r.id}>
                {r.reason} ·{" "}
                {money(r.amountCents, terms.currency, terms.precision)} approved
                · {money(r.settledCents, terms.currency, terms.precision)}{" "}
                settled
                {r.settledCents < r.amountCents
                  ? " · External settlement pending"
                  : " · Complete"}
              </p>
            ))}
          </CardContent>
        </Card>
      )}
      {goodsReturns.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Product returns</CardTitle>
          </CardHeader>
          <CardContent>
            {goodsReturns.map((r) => (
              <p key={r.id}>
                {r.reason} · {r.status}
                {r.reviewReason ? ` · ${r.reviewReason}` : ""}
              </p>
            ))}
            <p>
              Goods receipt and refund settlement are separate. The store will
              review the refund against original payment sources.
            </p>
          </CardContent>
        </Card>
      )}
      {fulfillment?.status === "fulfilled" && [...returnableQuantities.values()].some((quantity) => quantity > 0) && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Request a product return</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={requestReturnAction} className="grid gap-4">
              <Hidden name="locale" value={locale} />
              <Hidden name="orderId" value={id} />
              <Hidden name="requestKey" value={randomUUID()} />
              {items.map((item) => {
                const available = returnableQuantities.get(item.id) ?? 0;
                return available > 0 ? (
                  <label key={item.id}>
                    <Hidden name="itemIds" value={item.id} />
                    {orderItemName(item, quoteItems)} · up to {available} units
                    <Input
                      name={`quantity.${item.id}`}
                      type="number"
                      min="0"
                      max={available}
                      defaultValue="0"
                      required
                    />
                  </label>
                ) : null;
              })}
              <Field name="reason" label="Return reason" />
              <Button type="submit">Submit return request</Button>
            </form>
          </CardContent>
        </Card>
      )}
      {proposal ? (
        <Alert className="mt-6">
          <AlertTitle>Order Terms Updated</AlertTitle>
          <AlertDescription>
            <p>{proposal.reason}</p>
            <p>
              New total:{" "}
              <strong>
                {money(
                  proposal.proposedTotalCents,
                  terms.currency,
                  terms.precision,
                )}
              </strong>
            </p>
            <p>Payment instructions are paused until you accept.</p>
            <form action={acceptProposal}>
              <Hidden name="locale" value={locale} />
              <Hidden name="orderId" value={id} />
              <Hidden name="proposalId" value={proposal.id} />
              <Button type="submit">Accept New Total</Button>
            </form>
          </AlertDescription>
        </Alert>
      ) : order.purchaseTotalCents > 0 &&
        order.lifecycleStatus === "unpaid" &&
        terms.payment ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Payment instructions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>{terms.payment.name}</p>
            <p className="whitespace-pre-line text-muted-foreground">
              {terms.payment.instructions}
            </p>
            <div className="flex flex-wrap gap-3">
              <CopyButton
                value={(
                  (order.purchaseTotalCents - order.creditAppliedCents) /
                  10 ** terms.precision
                ).toFixed(terms.precision)}
                label="Copy exact amount"
              />
              <CopyButton
                value={order.referenceCode}
                label="Copy payment reference"
              />
            </div>
            <p>
              Use this reference for your payment. If you already paid, wait for
              the store to verify it; do not send a second payment.
            </p>
          </CardContent>
        </Card>
      ) : null}
      {terms.pickup && (
        <p>
          Pickup: {terms.pickup.address} · {terms.pickup.date}{" "}
          {terms.pickup.startTime}–{terms.pickup.endTime}
        </p>
      )}
      {order.purchaseTotalCents === 0 && (
        <p>No payment or payment evidence is required.</p>
      )}
      {order.purchaseTotalCents > 0 && (
        <section className="mt-8">
          <h2>Payment evidence</h2>
          <p>
            {evidence.length} image(s) received. Evidence does not confirm
            payment.
          </p>
          <Uploader orderId={id} />
        </section>
      )}
      <p className="mt-8 text-sm text-muted-foreground">
        Bookmark this page. Your order remains available here even if an email
        is delayed.
      </p>
    </section>
  );
}
