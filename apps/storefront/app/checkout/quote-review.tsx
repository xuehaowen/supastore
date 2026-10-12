"use client";
import { type StorefrontMessages } from "../../lib/i18n";
import { money, type Store } from "../../lib/types";
import { useCheckout } from "./use-checkout";
export function QuoteReview({
  checkout,
  store,
  locale,
  m,
}: {
  checkout: ReturnType<typeof useCheckout>;
  store: Store;
  locale: string;
  m: StorefrontMessages["checkout"];
}) {
  const { quote, appliedCredit } = checkout;
  return (
    <>
      {" "}
      {quote && (
        <div className="notice">
          <p>
            {m.shippingCost}:{" "}
            {money(
              quote.shippingCents,
              store.currency,
              store.precision,
              locale,
            )}
          </p>
          <p>
            {m.tax}:{" "}
            {money(
              quote.exclusiveTaxCents + quote.inclusiveTaxCents,
              store.currency,
              store.precision,
              locale,
            )}
          </p>
          <p>
            {m.discount}:{" "}
            {money(
              quote.discountCents,
              store.currency,
              store.precision,
              locale,
            )}
          </p>
          <strong>
            {m.orderTotal}:{" "}
            {money(
              quote.totalPayableCents,
              store.currency,
              store.precision,
              locale,
            )}
          </strong>
          <p>
            {m.quoteExpires}: {new Date(quote.expiresAt).toLocaleString(locale)}
          </p>
          <p>
            {m.creditApplied}:{" "}
            {money(appliedCredit, store.currency, store.precision, locale)}
          </p>
          <p>
            {m.remainingPayment}:{" "}
            {money(
              Math.max(0, quote.totalPayableCents - appliedCredit),
              store.currency,
              store.precision,
              locale,
            )}
          </p>
          <label htmlFor="checkout-accepted" className="check">
            <input
              id="checkout-accepted"
              name="accepted"
              type="checkbox"
              required
              onChange={(e) => e.stopPropagation()}
            />
            {m.acceptTotal}
          </label>
        </div>
      )}
    </>
  );
}
