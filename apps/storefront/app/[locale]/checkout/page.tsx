import { readPage } from "../../../lib/page-data";
import { CheckoutDetailsForm, CheckoutOrderForm } from "../../checkout-forms";
import { Notice } from "../../components";
import type { QuoteTerms } from "@supastore/contracts";
import { formatLocalDate } from "@supastore/i18n/customer";
import { textFor } from "@supastore/i18n/messages";
import { money } from "../../../lib/web";
import { getTranslations } from "next-intl/server";

import { ShippingAddress } from "../../shipping-address";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@supastore/ui/card";
import { availableFulfillment } from "@supastore/shipping/destination";
export const metadata = { robots: { index: false, follow: false } };
export default async function Checkout({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ quote?: string; edit?: string; error?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const t = await getTranslations({ locale });
  const {
    cart,
    store,
    shippingRules,
    accounts,
    locations,
    delivery,
    methods,
    savedQuote,
    quote,
    initial,
    customer,
    onlinePayment,
  } = await readPage("checkout", locale, query);
  return (
    <section className="mx-auto my-12 min-h-[50vh] max-w-4xl">
      <p className="mb-6 text-[10px] font-bold tracking-[0.2em]">
        {t("eyebrowCheckout")}
      </p>
      <h1 className="mb-7 font-serif text-5xl tracking-[-0.045em]">
        {quote ? t("review") : textFor(locale).ui.checkout}
      </h1>
      <div className="mb-8 flex items-center gap-3">
        <div
          className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium ${
            quote
              ? "bg-muted text-muted-foreground"
              : "bg-primary text-primary-foreground"
          }`}
        >
          <span className="flex size-4 items-center justify-center rounded-full bg-background/20 font-bold">
            1
          </span>
          <span>{textFor(locale).ui.fulfillmentDetails}</span>
        </div>
        <div className="h-px w-6 bg-border" aria-hidden="true" />
        <div
          className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium ${
            quote
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }`}
        >
          <span className="flex size-4 items-center justify-center rounded-full bg-background/20 font-bold">
            2
          </span>
          <span>{textFor(locale).ui.reviewPlaceOrder}</span>
        </div>
      </div>
      <Notice error={query.error} locale={locale} />
      {quote ? (
        <div className="grid gap-8 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("finalOrderTotal")}</CardTitle>
            </CardHeader>
            <CardContent>
              <a href={`/${locale}/checkout?quote=${quote.id}&edit=1`}>
                {t("editFulfillment")}
              </a>
              <p>
                {(quote.termsSnapshot as QuoteTerms).fulfillmentType ===
                "shipping"
                  ? t("shipping")
                  : (quote.termsSnapshot as QuoteTerms).fulfillmentType ===
                      "local_delivery"
                    ? t("checkoutDetails.localDelivery")
                    : t("pickup")}
              </p>
              {(quote.termsSnapshot as QuoteTerms).pickup && (
                <p>
                  {(quote.termsSnapshot as QuoteTerms).pickup!.address}
                  <br />
                  {formatLocalDate(
                    (quote.termsSnapshot as QuoteTerms).pickup!.date,
                    locale,
                  )}{" "}
                  · {(quote.termsSnapshot as QuoteTerms).pickup!.startTime} –{" "}
                  {(quote.termsSnapshot as QuoteTerms).pickup!.endTime} (
                  {store?.timezone})
                </p>
              )}
              {(quote.termsSnapshot as QuoteTerms).fulfillmentType !==
                "pickup" && (
                <ShippingAddress
                  address={(quote.termsSnapshot as QuoteTerms).shippingAddress}
                  locale={locale}
                />
              )}
              {(quote.termsSnapshot as QuoteTerms).delivery && (
                <p>
                  {(quote.termsSnapshot as QuoteTerms).delivery!.name}{" "}
                  {formatLocalDate(
                    (quote.termsSnapshot as QuoteTerms).delivery!.date ?? "",
                    locale,
                  )}{" "}
                  {(quote.termsSnapshot as QuoteTerms).delivery!.startTime}{" "}
                  {(quote.termsSnapshot as QuoteTerms).delivery!.endTime}
                </p>
              )}
              <dl className="grid grid-cols-2 gap-4 border-t pt-5">
                <dt>{t("merchandise")}</dt>
                <dd className="m-0 text-right">
                  {money(
                    quote.merchandiseSubtotalCents,
                    store?.currency,
                    store?.precision,
                    locale,
                  )}
                </dd>
                <dt>{t("delivery")}</dt>
                <dd className="m-0 text-right">
                  {quote.shippingCents === 0
                    ? money(0, store?.currency, store?.precision, locale)
                    : money(
                        quote.shippingCents,
                        store?.currency,
                        store?.precision,
                        locale,
                      )}
                </dd>
                <dt>{t("tax")}</dt>
                <dd className="m-0 text-right">
                  {money(
                    quote.exclusiveTaxCents + quote.inclusiveTaxCents,
                    store?.currency,
                    store?.precision,
                    locale,
                  )}
                </dd>
                {quote.discountCents > 0 && (
                  <>
                    <dt>{t("checkoutDetails.promotion")}</dt>
                    <dd className="m-0 text-right">
                      −
                      {money(
                        quote.discountCents,
                        store?.currency,
                        store?.precision,
                        locale,
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
                      locale,
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
              <CheckoutOrderForm
                key={quote.id}
                quoteId={quote.id}
                locale={locale}
                customerName={customer?.customer.name}
                customerEmail={customer?.customer.email}
                credit={
                  customer?.credit?.reconciled
                    ? {
                        availableCents:
                          customer.credit.account.balanceCents -
                          customer.credit.account.reservedCents,
                        purchaseCents: quote.totalPayableCents,
                        currency: customer.credit.account.currency,
                        precision: customer.credit.account.precision,
                        payInFull:
                          !(quote.termsSnapshot as QuoteTerms).payment &&
                          !(quote.termsSnapshot as QuoteTerms).onlinePayment,
                      }
                    : undefined
                }
              />
            </CardContent>
          </Card>
        </div>
      ) : cart?.items.length ? (
        <div className="checkout-layout">
          <Card className="checkout-form-card">
            <CardHeader>
              <CardTitle>{t("checkoutDetails.heading")}</CardTitle>
              <CardDescription>
                {t("checkoutDetails.description")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CheckoutDetailsForm
                key={savedQuote?.id ?? cart.id}
                cartId={cart.id}
                locale={locale}
                shippingRules={shippingRules}
                methods={methods}
                deliveryAreas={delivery.map((area) => ({
                  id: area.id,
                  name: area.name,
                  countryCodes: area.countryCodes,
                  postalPrefixes: area.postalPrefixes,
                  scheduleRequired: area.scheduleRequired,
                  dates: area.dates,
                }))}
                accounts={accounts}
                onlinePayment={onlinePayment}
                canBeFree={cart.subtotalCents === 0}
                canUseCredit={Boolean(
                  customer?.credit?.reconciled &&
                  customer.credit.account.balanceCents >
                    customer.credit.account.reservedCents,
                )}
                initial={
                  initial
                    ? {
                        ...initial.input,
                        address: initial.shippingAddress.address,
                        country: initial.shippingAddress.country,
                        region: initial.shippingAddress.region ?? "",
                        postalCode: initial.shippingAddress.postalCode ?? "",
                      }
                    : undefined
                }
                addresses={customer?.addresses ?? []}
                timezone={store?.timezone ?? "UTC"}
                locations={locations.map((location) => ({
                  id: location.id,
                  name: location.name,
                  address: location.address,
                  scheduleRequired: location.scheduleRequired,
                  dates: location.dates,
                }))}
              />
            </CardContent>
          </Card>
          <Card className="checkout-summary-card">
            <CardHeader>
              <CardTitle>{t("cart")}</CardTitle>
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
                      locale,
                    )}
                  </span>
                </div>
              ))}
              <div className="flex justify-between border-t pt-4 font-medium">
                <span>{t("checkoutDetails.subtotal")}</span>
                <span className="tabular-nums">
                  {money(
                    cart.subtotalCents,
                    store?.currency,
                    store?.precision,
                    locale,
                  )}
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
