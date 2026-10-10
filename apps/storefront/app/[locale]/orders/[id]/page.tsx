import { parseOrderDetailDto, parseStoreDto } from "@supastore/contracts";
import {
  formatLocalDate,
  statusLabel,
} from "../../../../../../packages/i18n/src/customer";
import { money, readApi } from "../../../../lib/api";
import { getStorefrontMessages } from "../../../../lib/i18n";
import { PurchaseAnalytics } from "../../../analytics";
import { OrderActions } from "../../../order-client";
export const metadata = { robots: { index: false, follow: false } };
export default async function OrderPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const m = getStorefrontMessages(locale);
  const result = await readApi(
    `orders/${encodeURIComponent(id)}`,
    parseOrderDetailDto,
  );
  const store = await readApi("store", parseStoreDto);
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
      <section>
        <a
          href={`mailto:${store.supportEmail}?subject=${encodeURIComponent(`Order ${order.referenceCode}`)}`}
        >
          {m.order.contactSupport}
        </a>
        <p>{m.order.supportHelp}</p>
      </section>
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
      <p>
        {m.order.creditApplied}:{" "}
        {money(
          order.creditAppliedCents,
          order.terms.currency,
          order.terms.precision,
          locale,
        )}
      </p>
      <p>
        {m.order.remainingPayment}:{" "}
        {money(
          Math.max(
            0,
            order.purchaseTotalCents -
              order.creditAppliedCents -
              result.receivedCents,
          ),
          order.terms.currency,
          order.terms.precision,
          locale,
        )}
      </p>
      {order.terms.pickup && (
        <p>
          {m.order.pickupDetails}: {order.terms.pickup.address} ·{" "}
          {formatLocalDate(order.terms.pickup.date, locale)}{" "}
          {order.terms.pickup.startTime}–{order.terms.pickup.endTime}
        </p>
      )}
      {!!result.returns?.length && (
        <section>
          <h2>{m.order.returns}</h2>
          {result.returns.map((r) => (
            <p key={r.id}>
              {statusLabel(r.status, locale)} · {r.reason}
            </p>
          ))}
          <p>{m.order.returnNotice}</p>
        </section>
      )}
      {!!result.refunds?.length && (
        <section>
          <h2>{m.order.refunds}</h2>
          {result.refunds.map((r) => (
            <p key={r.id}>
              {r.reason} ·{" "}
              {money(
                r.amountCents,
                order.terms.currency,
                order.terms.precision,
                locale,
              )}{" "}
              · {m.order.settledRefund}:{" "}
              {money(
                r.settledCents,
                order.terms.currency,
                order.terms.precision,
                locale,
              )}
            </p>
          ))}
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
        paymentStatus={result.paymentStatus}
        returnableItems={(result.returnableItems || []).map((item) => ({
          ...item,
          title:
            result.items.find((i) => i.id === item.id)?.catalog.productTitle ||
            result.items.find((i) => i.id === item.id)?.catalog.title ||
            item.id,
        }))}
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
