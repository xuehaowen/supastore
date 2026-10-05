import { and, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  quotes,
  carts,
  paymentAccounts,
  pickupLocation,
  storeSettings,
} from "@/infrastructure/db/schema";
import { guestIdentity, customerIdentity, money } from "@/infrastructure/web";
import { customerAccount } from "@/application/use-cases/customers/customer-ownership";
import { CheckoutCredit } from "@/app/checkout-credit";
import { getCart } from "@/application/use-cases/cart/get-cart";
import type { QuoteTerms } from "@/application/use-cases/get-quote";
import { quoteCart, placeOrder } from "@/app/actions";
import { Field, Hidden, Notice } from "@/app/components";
import { CheckoutFields } from "@/app/checkout-fields";
import { pickupAvailability } from "@/domain/pickup-availability";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
export const metadata = { robots: { index: false, follow: false } };
export default async function Checkout({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ quote?: string; error?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const t = await getTranslations({ locale });
  const identity = await guestIdentity();
  const cart = identity
    ? await getCart({ guestSessionId: identity, locale })
    : null;
  const [store] = await db.select().from(storeSettings).limit(1);
  const accounts = await db
    .select({ id: paymentAccounts.id, name: paymentAccounts.accountName })
    .from(paymentAccounts)
    .where(eq(paymentAccounts.isActive, true));
  const locations = await db
    .select()
    .from(pickupLocation)
    .orderBy(pickupLocation.name);
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
  const customerUserId = await customerIdentity();
  const customer = customerUserId
    ? await customerAccount(customerUserId)
    : null;
  return (
    <section className="mx-auto my-12 min-h-[50vh] max-w-4xl">
      <p className="mb-6 text-[10px] font-bold tracking-[0.2em]">
        {t("eyebrowCheckout")}
      </p>
      <h1 className="mb-7 font-serif text-5xl tracking-[-0.045em]">
        {t("review")}
      </h1>
      <Notice error={query.error} />
      {quote ? (
        <div className="grid gap-8 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("finalOrderTotal")}</CardTitle>
            </CardHeader>
            <CardContent>
              <a href={"/" + locale + "/checkout"}>{t("editFulfillment")}</a>
              <p>
                {(quote.termsSnapshot as QuoteTerms).fulfillmentType ===
                "shipping"
                  ? t("shipping")
                  : t("pickup")}
              </p>
              {(quote.termsSnapshot as QuoteTerms).pickup && (
                <p>
                  {(quote.termsSnapshot as QuoteTerms).pickup!.address}
                  <br />
                  {(quote.termsSnapshot as QuoteTerms).pickup!.date} ·{" "}
                  {(quote.termsSnapshot as QuoteTerms).pickup!.startTime} –{" "}
                  {(quote.termsSnapshot as QuoteTerms).pickup!.endTime} (
                  {store?.timezone})
                </p>
              )}
              {(quote.termsSnapshot as QuoteTerms).fulfillmentType ===
                "shipping" && (
                <p>
                  {(quote.termsSnapshot as QuoteTerms).shippingAddress.address},{" "}
                  {(quote.termsSnapshot as QuoteTerms).shippingAddress.country}
                </p>
              )}
              <dl className="grid grid-cols-2 gap-4 border-t pt-5">
                <dt>{t("merchandise")}</dt>
                <dd className="m-0 text-right">
                  {money(
                    quote.merchandiseSubtotalCents,
                    store?.currency,
                    store?.precision,
                  )}
                </dd>
                <dt>{t("delivery")}</dt>
                <dd className="m-0 text-right">
                  {quote.shippingCents === 0
                    ? money(0, store?.currency, store?.precision)
                    : money(
                        quote.shippingCents,
                        store?.currency,
                        store?.precision,
                      )}
                </dd>
                <dt>{t("tax")}</dt>
                <dd className="m-0 text-right">
                  {money(
                    quote.exclusiveTaxCents + quote.inclusiveTaxCents,
                    store?.currency,
                    store?.precision,
                  )}
                </dd>
                {quote.discountCents > 0 && (
                  <>
                    <dt>Promotion</dt>
                    <dd className="m-0 text-right">
                      −
                      {money(
                        quote.discountCents,
                        store?.currency,
                        store?.precision,
                      )}
                    </dd>
                  </>
                )}
                <dt>{t("total")}</dt>
                <dd className="m-0 text-right">
                  <strong>
                    {money(
                      quote.totalPayableCents,
                      store?.currency,
                      store?.precision,
                    )}
                  </strong>
                </dd>
              </dl>
              <p className="mt-5 text-sm text-muted-foreground">
                {t("finalTotalNotice")}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <form className="grid gap-4" action={placeOrder}>
                <Hidden name="locale" value={locale} />
                <Hidden name="quoteId" value={quote.id} />
                <Field
                  label={t("name")}
                  name="name"
                  value={customer?.customer.name}
                />
                <Field
                  label={t("email")}
                  name="email"
                  type="email"
                  value={customer?.customer.email}
                />
                {customer?.credit?.reconciled && (
                  <CheckoutCredit
                    availableCents={
                      customer.credit.account.balanceCents -
                      customer.credit.account.reservedCents
                    }
                    purchaseCents={quote.totalPayableCents}
                    currency={customer.credit.account.currency}
                    precision={customer.credit.account.precision}
                    locale={locale}
                  />
                )}
                <Label className="flex items-start gap-3 font-normal">
                  <Input
                    className="mt-0.5 size-4 shrink-0"
                    type="checkbox"
                    name="accepted"
                    value="yes"
                    required
                  />
                  {t("acceptTerms")}
                </Label>
                <Button type="submit">{t("place")}</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : cart?.items.length ? (
        <div className="checkout-layout">
          <Card className="checkout-form-card">
            <CardHeader>
              <CardTitle>How should we get it to you?</CardTitle>
              <CardDescription>
                Choose delivery or a local pickup window. We’ll confirm the
                final total next.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-5" action={quoteCart}>
                <Hidden name="locale" value={locale} />
                <Hidden name="cartId" value={cart.id} />
                <CheckoutFields
                  addresses={customer?.addresses ?? []}
                  timezone={store?.timezone ?? "UTC"}
                  locations={locations.map((location) => ({
                    id: location.id,
                    name: location.name,
                    address: location.address,
                    dates: pickupAvailability(
                      location,
                      store?.timezone ?? "UTC",
                    ),
                  }))}
                />
                <Field
                  label="Promotion code"
                  name="promotionCode"
                  required={false}
                />
                <div className="grid gap-2">
                  <Label>
                    {t("payment")}
                    <NativeSelect name="paymentAccountId">
                      <option value="">
                        {locale === "zh"
                          ? "全额使用余额或免费订单"
                          : "Store credit in full or free order"}
                      </option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </Label>
                </div>
                <Button type="submit" size="lg">
                  {t("review")} →
                </Button>
              </form>
            </CardContent>
          </Card>
          <Card className="checkout-summary-card">
            <CardHeader>
              <CardTitle>Your bag</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {cart.items.map((item) => (
                <div
                  className="flex justify-between gap-4 text-sm"
                  key={item.id}
                >
                  <span>
                    {item.quantity} × {item.productTitle}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {money(
                      item.lineTotalCents,
                      store?.currency,
                      store?.precision,
                    )}
                  </span>
                </div>
              ))}
              <div className="flex justify-between border-t pt-4 font-medium">
                <span>Subtotal</span>
                <span className="tabular-nums">
                  {money(cart.subtotalCents, store?.currency, store?.precision)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <p>{t("empty")}</p>
      )}
    </section>
  );
}
