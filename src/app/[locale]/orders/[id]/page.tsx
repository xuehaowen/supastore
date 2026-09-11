import { trackOrder } from "@/application/use-cases/tracking";
import { orderToken, money } from "@/infrastructure/web";
import { UnauthorizedError } from "@/application/common/errors";
import { redirect } from "next/navigation";
import type { QuoteTerms } from "@/application/use-cases/get-quote";
import { CopyButton, Uploader } from "@/app/interactive";
import { Hidden, Notice } from "@/app/components";
import { acceptProposal } from "@/app/actions";
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
    <section className="narrow">
      <p className="eyebrow">YOUR ORDER IS SAVED</p>
      <h1>{order.referenceCode}</h1>
      <Notice error={query.error} />
      <p className="badge">
        {order.lifecycleStatus} · {fulfillment?.status.replaceAll("_", " ")}
      </p>
      <dl>
        <dt>Order total</dt>
        <dd>
          {money(order.purchaseTotalCents, terms.currency, terms.precision)}
        </dd>
        <dt>Received</dt>
        <dd>{money(receivedCents, terms.currency, terms.precision)}</dd>
        <dt>Balance</dt>
        <dd>
          {money(
            order.purchaseTotalCents - receivedCents,
            terms.currency,
            terms.precision,
          )}
        </dd>
      </dl>
      {proposal ? (
        <section className="notice">
          <h2>Order Terms Updated</h2>
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
            <button>Accept New Total</button>
          </form>
        </section>
      ) : order.purchaseTotalCents > 0 &&
        order.lifecycleStatus === "unpaid" &&
        terms.payment ? (
        <section className="panel">
          <h2>Payment instructions</h2>
          <p>{terms.payment.name}</p>
          <p className="description">{terms.payment.instructions}</p>
          <div className="actions">
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
        </section>
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
        <section>
          <h2>Payment evidence</h2>
          <p>
            {evidence.length} image(s) received. Evidence does not confirm
            payment.
          </p>
          <Uploader orderId={id} />
        </section>
      )}
      <p className="muted">
        Bookmark this page. Your order remains available here even if an email
        is delayed.
      </p>
    </section>
  );
}
