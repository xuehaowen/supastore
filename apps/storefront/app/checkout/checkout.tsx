"use client";
import { getStorefrontMessages, type StorefrontMessages } from "../../lib/i18n";
import { money, type Cart, type Store } from "../../lib/types";
import { FulfillmentFields } from "./fulfillment-fields";
import { QuoteReview } from "./quote-review";
import { useCheckout } from "./use-checkout";
export function Checkout({
  cart,
  locale,
  store,
  messages,
}: {
  cart: Cart;
  locale: string;
  store: Store;
  messages?: StorefrontMessages["checkout"];
}) {
  const m = messages ?? getStorefrontMessages(locale).checkout;
  const checkout = useCheckout(cart, locale, store, m);
  const {
    quote,
    invalidateQuote,
    creditAmount,
    setCreditAmount,
    customerName,
    setCustomerName,
    customerEmail,
    setCustomerEmail,
    availableCredit,
    methods,
    busy,
    msg,
    method,
    submit,
  } = checkout;
  return (
    <form className="stack" onChange={invalidateQuote} onSubmit={submit}>
      <label htmlFor="checkout-name">{m.name}</label>
      <input
        id="checkout-name"
        name="name"
        required
        autoComplete="name"
        value={customerName}
        onChange={(e) => setCustomerName(e.target.value)}
      />
      <label htmlFor="checkout-email">{m.email}</label>
      <input
        id="checkout-email"
        name="email"
        type="email"
        value={customerEmail}
        onChange={(e) => setCustomerEmail(e.target.value)}
        required
        autoComplete="email"
      />
      <FulfillmentFields
        checkout={checkout}
        store={store}
        locale={locale}
        m={m}
      />
      <label htmlFor="checkout-payment-method">{m.paymentMethod}</label>
      <select
        id="checkout-payment-method"
        name="paymentAccountId"
        defaultValue={
          store.stripeConfigured ? "" : store.paymentMethods[0]?.id || ""
        }
      >
        {store.stripeConfigured && (
          <option value="">{m.onlineCardPayment}</option>
        )}
        {!store.stripeConfigured && <option value="">{m.creditOnly}</option>}
        {store.paymentMethods.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <label htmlFor="checkout-promo-code">{m.promoCode}</label>
      <input id="checkout-promo-code" name="promotionCode" maxLength={100} />
      <label htmlFor="checkout-credit-amount">
        {m.creditToApply} ({store.currency})
      </label>
      <input
        id="checkout-credit-amount"
        name="creditAmount"
        type="number"
        value={creditAmount}
        onChange={(e) => setCreditAmount(e.target.value)}
        max={availableCredit / 10 ** store.precision}
        min="0"
        step={10 ** -store.precision}
      />
      <p>
        {m.availableCredit}:{" "}
        {money(availableCredit, store.currency, store.precision, locale)}
      </p>
      <QuoteReview checkout={checkout} store={store} locale={locale} m={m} />
      <button
        disabled={
          busy || !methods.length || store.isPaused || !store.isOrderingEnabled
        }
      >
        {quote ? m.placeOrder : m.reviewTotal}
      </button>
      <p role="status">{msg}</p>
    </form>
  );
}
