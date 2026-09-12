import { trackOrder } from "@/application/use-cases/tracking";
import { orderToken, money } from "@/infrastructure/web";
import { UnauthorizedError } from "@/application/common/errors";
import { redirect } from "next/navigation";
import type { QuoteTerms } from "@/application/use-cases/get-quote";
import { CopyButton, Uploader } from "@/app/interactive";
import { Hidden, Notice } from "@/app/components";
import { acceptProposal } from "@/app/actions";
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
  const { order, proposal, receivedCents, fulfillment, evidence } = result;
  const terms = order.termsSnapshot as QuoteTerms;
  return (
    <section className="mx-auto my-12 min-h-[50vh] max-w-3xl">
      <p className="mb-6 text-[10px] font-bold tracking-[0.2em]">YOUR ORDER IS SAVED</p>
      <h1 className="mb-7 font-serif text-5xl tracking-[-0.045em]">{order.referenceCode}</h1>
      <Notice error={query.error} />
      <Badge variant="secondary" className="mb-6">
        {order.lifecycleStatus} · {fulfillment?.status.replaceAll("_", " ")}
      </Badge>
      <dl className="grid grid-cols-2 gap-4 border-t pt-5">
        <dt>Order total</dt>
        <dd className="m-0 text-right">
          {money(order.purchaseTotalCents, terms.currency, terms.precision)}
        </dd>
        <dt>Received</dt>
        <dd className="m-0 text-right">{money(receivedCents, terms.currency, terms.precision)}</dd>
        <dt>Balance</dt>
        <dd className="m-0 text-right">
          {money(
            order.purchaseTotalCents - receivedCents,
            terms.currency,
            terms.precision,
          )}
        </dd>
      </dl>
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
          <CardHeader><CardTitle>Payment instructions</CardTitle></CardHeader>
          <CardContent className="space-y-4">
          <p>{terms.payment.name}</p>
          <p className="whitespace-pre-line text-muted-foreground">{terms.payment.instructions}</p>
          <div className="flex flex-wrap gap-3">
            <CopyButton
              value={(order.purchaseTotalCents / 10 ** terms.precision).toFixed(
                terms.precision,
              )}
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
