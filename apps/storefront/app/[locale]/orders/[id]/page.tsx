import { readApi, money, type Store } from "../../../../lib/api";
import { OrderActions } from "../../../order-client";
import { PurchaseAnalytics } from "../../../analytics";
import { getStorefrontMessages } from "../../../../lib/i18n";
import { statusLabel } from "../../../../../../packages/i18n/src/customer";
export const metadata = { robots: { index: false, follow: false } };
interface OrderDetail {
  order: {
    referenceCode: string;
    lifecycleStatus: string;
    purchaseTotalCents: number;
    creditAppliedCents: number;
    terms: {
      currency: string;
      precision: number;
      payment: { name: string; instructions: string } | null;
    };
  };
  receivedCents: number;
  shipments?: {
    id: string;
    carrier: string;
    trackingNumber: string | null;
    status: string;
    items: { orderItemId: string; quantity: number }[];
  }[];
  proposal?: { id: string; reason: string; proposedTotalCents: number } | null;
  items: {
    id: string;
    quantity: number;
    lineTotalCents: number;
    catalog: { productTitle?: string; variantTitle?: string; title?: string };
  }[];
  fulfillment: {
    status: string;
    carrier: string | null;
    trackingNumber: string | null;
  } | null;
}
export default async function OrderPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const m = getStorefrontMessages(locale);
  const result = await readApi<OrderDetail>(`orders/${encodeURIComponent(id)}`);
  const store = await readApi<Store>("store");
  const { order } = result;
  return (
    <div className="stack">
      {["confirmed", "completed"].includes(order.lifecycleStatus) && (
        <PurchaseAnalytics
          orderId={id}
          total={order.purchaseTotalCents / 10 ** order.terms.precision}
          currency={order.terms.currency}
        />
      )}
      <h1>
        {m.order.title} {order.referenceCode}
      </h1>
      <p>{statusLabel(order.lifecycleStatus, locale)}</p>
      {result.items.map((i) => (
        <p key={i.id}>
          {i.catalog.productTitle || i.catalog.title} · {i.catalog.variantTitle}{" "}
          × {i.quantity} —{" "}
          {money(
            i.lineTotalCents,
            order.terms.currency,
            order.terms.precision,
            locale,
          )}
        </p>
      ))}
      <p>
        {m.order.total}:{" "}
        {money(
          order.purchaseTotalCents,
          order.terms.currency,
          order.terms.precision,
          locale,
        )}
      </p>
      <p>
        {m.order.paymentReceived}:{" "}
        {money(
          result.receivedCents,
          order.terms.currency,
          order.terms.precision,
          locale,
        )}
      </p>
      {order.terms.payment && (
        <section className="card">
          <h2>{order.terms.payment.name}</h2>
          <p>{order.terms.payment.instructions}</p>
          <p>{m.order.includeReference}</p>
        </section>
      )}
      {result.fulfillment && (
        <p>
          {statusLabel(result.fulfillment.status, locale)} ·{" "}
          {result.fulfillment.carrier} {result.fulfillment.trackingNumber}
        </p>
      )}
      <OrderActions
        proposedTotalLabel={
          result.proposal
            ? money(
                result.proposal.proposedTotalCents,
                order.terms.currency,
                order.terms.precision,
                locale,
              )
            : ""
        }
        id={id}
        locale={locale}
        messages={m.order}
        unpaid={order.lifecycleStatus === "unpaid" && !result.proposal}
        proposal={result.proposal || null}
        stripeConfigured={Boolean(store.stripeConfigured)}
      />
      {!!result.shipments?.length && (
        <section>
          <h2>{m.order.shipments}</h2>
          {result.shipments.map((shipment) => (
            <article key={shipment.id} className="card">
              <h3>{shipment.carrier}</h3>
              <p>
                {statusLabel(shipment.status, locale)} ·{" "}
                {shipment.trackingNumber || m.order.noTracking}
              </p>
              <p>
                {shipment.items.reduce((sum, item) => sum + item.quantity, 0)}{" "}
                {m.order.units}
              </p>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
