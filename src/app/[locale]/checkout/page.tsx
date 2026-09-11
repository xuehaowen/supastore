import { and, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  quotes,
  carts,
  paymentAccounts,
  pickupLocation,
  storeSettings,
} from "@/infrastructure/db/schema";
import { guestIdentity, money } from "@/infrastructure/web";
import { getCart } from "@/application/use-cases/cart/get-cart";
import type { QuoteTerms } from "@/application/use-cases/get-quote";
import { quoteCart, placeOrder } from "@/app/actions";
import { Field, Hidden, Notice } from "@/app/components";
import { getTranslations } from "next-intl/server";
export default async function Checkout({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ quote?: string; error?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const t = await getTranslations({locale});
  const identity = await guestIdentity();
  const cart = identity
    ? await getCart({ guestSessionId: identity, locale })
    : null;
  const [store] = await db.select().from(storeSettings).limit(1);
  const accounts = await db
    .select({ id: paymentAccounts.id, name: paymentAccounts.accountName })
    .from(paymentAccounts)
    .where(eq(paymentAccounts.isActive, true));
  const [pickup] = await db.select().from(pickupLocation).limit(1);
  const [ownedQuote] = query.quote
    ? await db
        .select({ quote: quotes })
        .from(quotes)
        .innerJoin(carts, eq(carts.id, quotes.cartId))
        .where(
          and(eq(quotes.id, query.quote), eq(carts.guestSessionId, identity)),
        )
    : [];
  const quote = ownedQuote?.quote;
  return (
    <section className="narrow">
      <p className="eyebrow">ONE LAST LOOK</p>
      <h1>{t("review")}</h1>
      <Notice error={query.error} />
      {quote ? (
        <div className="checkout-grid">
          <div>
            <h2>Accepted quote</h2>
            <p>
              {(quote.termsSnapshot as QuoteTerms).fulfillmentType ===
              "shipping"
                ? "Shipping"
                : "Local pickup"}
            </p>
            <dl>
              <dt>Merchandise</dt>
              <dd>
                {money(
                  quote.merchandiseSubtotalCents,
                  store?.currency,
                  store?.precision,
                )}
              </dd>
              <dt>Shipping</dt>
              <dd>
                {quote.shippingCents === 0
                  ? t("free")
                  : money(
                      quote.shippingCents,
                      store?.currency,
                      store?.precision,
                    )}
              </dd>
              <dt>Tax</dt>
              <dd>
                {money(
                  quote.exclusiveTaxCents + quote.inclusiveTaxCents,
                  store?.currency,
                  store?.precision,
                )}
              </dd>
              <dt>{t("total")}</dt>
              <dd>
                <strong>
                  {money(
                    quote.totalPayableCents,
                    store?.currency,
                    store?.precision,
                  )}
                </strong>
              </dd>
            </dl>
            <p className="muted">
              Valid until {quote.expiresAt.toISOString()}. Payment instructions
              appear after your order is saved.
            </p>
          </div>
          <form action={placeOrder}>
            <Hidden name="locale" value={locale} />
            <Hidden name="quoteId" value={quote.id} />
            <Field label={t("name")} name="name" />
            <Field label={t("email")} name="email" type="email" />
            <label className="check">
              <input type="checkbox" name="accepted" value="yes" required />I
              accept this total and fulfillment terms.
            </label>
            <button>{t("place")}</button>
          </form>
        </div>
      ) : cart?.items.length ? (
        <form action={quoteCart}>
          <Hidden name="locale" value={locale} />
          <Hidden name="cartId" value={cart.id} />
          <label>
            Fulfillment
            <select name="fulfillmentType">
              <option value="shipping">{t("shipping")}</option>
              {pickup && <option value="pickup">{t("pickup")}</option>}
            </select>
          </label>
          <Field label={t("address")} name="address" required={false} />
          <Field label={t("country")} name="country" value="US" required={false} />
          {pickup && (
            <fieldset>
              <legend>
                {t("pickup")} · {pickup.name}
              </legend>
              <p>{pickup.address}</p>
              <Field
                label="Pickup date"
                name="pickupDate"
                type="date"
                required={false}
              />
              <label>
                Pickup time
                <select name="pickupTime">
                  <option value="">Choose a time</option>
                  {[
                    ...new Set(
                      Object.values(pickup.weeklySchedule)
                        .flat()
                        .map((s) => s[0]),
                    ),
                  ].map((time) => (
                    <option key={time}>{time}</option>
                  ))}
                </select>
              </label>
              <p className="muted">
                At least {pickup.prepMinutes} minutes notice. Times are in{" "}
                {store?.timezone}.
              </p>
            </fieldset>
          )}
          <label>
            {t("payment")}
            <select name="paymentAccountId">
              <option value="">No payment required for a free order</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <button>{t("quote")} →</button>
        </form>
      ) : (
        <p>{t("empty")}</p>
      )}
    </section>
  );
}
