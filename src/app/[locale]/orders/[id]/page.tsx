import { textFor } from "@/i18n/messages";
import { statusLabel, formatLocalDate } from "@/i18n/customer";
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
import { getTranslations } from "next-intl/server";
export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale, id } = await params;
  const query = await searchParams;
  const t = await getTranslations({ locale });
  const result = await trackOrder(id, await orderToken(id)).catch((error) => {
    if (error instanceof UnauthorizedError)
      redirect(`/recover?locale=${locale}`);
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
  const returnableQuantities = new Map(
    items.map((item) => {
      const committed = returnItems
        .filter(
          (ri) =>
            ri.orderItemId === item.id &&
            goodsReturns.some(
              (r) =>
                r.id === ri.returnId &&
                ["requested", "approved", "received"].includes(r.status),
            ),
        )
        .reduce((sum, ri) => sum + ri.quantity, 0);
      const available = item.quantity - committed;
      return [item.id, available] as const;
    }),
  );
  const terms = order.termsSnapshot as QuoteTerms;
  return (
    <section className="mx-auto my-12 min-h-[50vh] max-w-3xl">
      <p className="mb-6 text-[10px] font-bold tracking-[0.2em]">
        {t("order.saved")}
      </p>
      <h1 className="mb-7 font-serif text-5xl tracking-[-0.045em]">
        {order.referenceCode}
      </h1>
      <Notice error={query.error} locale={locale} />

      {/* Visual Order Lifecycle Stepper */}
      {order.lifecycleStatus === "cancelled" ? (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>{t("order.cancelled")}</AlertTitle>
          <AlertDescription>{t("order.cancelledMsg")}</AlertDescription>
        </Alert>
      ) : (
        <div className="mb-8 rounded-xl border bg-card p-5">
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              {
                step: 1,
                label: t("order.placed"),
                done: true,
                current: false,
              },
              {
                step: 2,
                label: t("order.payment"),
                done: order.lifecycleStatus !== "unpaid",
                current: order.lifecycleStatus === "unpaid",
              },
              {
                step: 3,
                label: t("order.fulfillment"),
                done:
                  fulfillment?.status === "fulfilled" ||
                  order.lifecycleStatus === "completed",
                current:
                  order.lifecycleStatus === "confirmed" &&
                  fulfillment?.status !== "fulfilled",
              },
              {
                step: 4,
                label: t("order.completed"),
                done: order.lifecycleStatus === "completed",
                current: false,
              },
            ].map((item, idx) => (
              <div key={idx} className="flex flex-col items-center">
                <div
                  className={`flex size-7 items-center justify-center rounded-full text-xs font-semibold ${
                    item.done
                      ? "bg-primary text-primary-foreground"
                      : item.current
                        ? "border-2 border-primary text-primary"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {item.done ? "✓" : item.step}
                </div>
                <span
                  className={`mt-2 text-xs ${
                    item.done || item.current
                      ? "font-medium text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!order.customerId && (
        <form action={claimOrderAction} className="mb-5">
          <Hidden name="locale" value={locale} />
          <Hidden name="orderId" value={id} />
          <Button type="submit" variant="outline">
            {t("order.addToAccount")}
          </Button>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("order.claimHint")}
          </p>
        </form>
      )}
      <Badge variant="secondary" className="mb-6">
        {statusLabel(order.lifecycleStatus, locale)} ·{" "}
        {statusLabel(fulfillment?.status, locale)}
      </Badge>
      <dl className="grid grid-cols-2 gap-4 border-t pt-5">
        <dt>{t("order.total")}</dt>
        <dd className="m-0 text-right">
          {money(
            order.purchaseTotalCents,
            terms.currency,
            terms.precision,
            locale,
          )}
        </dd>
        <dt>{t("order.received")}</dt>
        <dd className="m-0 text-right">
          {money(receivedCents, terms.currency, terms.precision, locale)}
        </dd>
        {order.creditAppliedCents > 0 && (
          <>
            <dt>{t("order.creditApplied")}</dt>
            <dd className="m-0 text-right">
              {money(
                order.creditAppliedCents,
                terms.currency,
                terms.precision,
                locale,
              )}
            </dd>
          </>
        )}
        <dt>{t("order.balance")}</dt>
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
            locale,
          )}
        </dd>
      </dl>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("order.items")}</CardTitle>
        </CardHeader>
        <CardContent>
          {items.map((item) => (
            <p key={item.id}>
              {orderItemName(item, quoteItems)} · {item.quantity} ×{" "}
              {money(
                item.unitPriceCents,
                terms.currency,
                terms.precision,
                locale,
              )}
            </p>
          ))}
        </CardContent>
      </Card>
      {result.refunds.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t("order.refunds")}</CardTitle>
          </CardHeader>
          <CardContent>
            {result.refunds.map((r) => (
              <p key={r.id}>
                {r.reason} ·{" "}
                {money(r.amountCents, terms.currency, terms.precision, locale)}{" "}
                {textFor(locale).common.approved}·{" "}
                {money(r.settledCents, terms.currency, terms.precision, locale)}{" "}
                {textFor(locale).common.settled}
                {r.settledCents < r.amountCents
                  ? ` · ${textFor(locale).common.settlementPending}`
                  : ` · ${textFor(locale).common.complete}`}
              </p>
            ))}
          </CardContent>
        </Card>
      )}
      {goodsReturns.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t("order.returns")}</CardTitle>
          </CardHeader>
          <CardContent>
            {goodsReturns.map((r) => (
              <p key={r.id}>
                {r.reason} · {statusLabel(r.status, locale)}
                {r.reviewReason ? ` · ${r.reviewReason}` : ""}
              </p>
            ))}
            <p>{textFor(locale).common.returnSettlementNotice}</p>
          </CardContent>
        </Card>
      )}
      {fulfillment?.status === "fulfilled" &&
        [...returnableQuantities.values()].some((quantity) => quantity > 0) && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>{t("order.requestReturn")}</CardTitle>
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
                      {orderItemName(item, quoteItems)} ·{" "}
                      {textFor(locale).common.returnLimit.replace(
                        "{count}",
                        String(available),
                      )}
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
                <Field name="reason" label={t("order.returnReason")} />
                <Button type="submit">{t("order.submitReturn")}</Button>
              </form>
            </CardContent>
          </Card>
        )}
      {proposal ? (
        <Alert className="mt-6">
          <AlertTitle>{textFor(locale).common.termsUpdated}</AlertTitle>
          <AlertDescription>
            <p>{proposal.reason}</p>
            <p>
              {textFor(locale).common.newTotal}:{" "}
              <strong>
                {money(
                  proposal.proposedTotalCents,
                  terms.currency,
                  terms.precision,
                  locale,
                )}
              </strong>
            </p>
            <p>{textFor(locale).common.paymentPaused}</p>
            <form action={acceptProposal}>
              <Hidden name="locale" value={locale} />
              <Hidden name="orderId" value={id} />
              <Hidden name="proposalId" value={proposal.id} />
              <Button type="submit">
                {textFor(locale).common.acceptNewTotal}
              </Button>
            </form>
          </AlertDescription>
        </Alert>
      ) : order.purchaseTotalCents > 0 &&
        order.lifecycleStatus === "unpaid" &&
        terms.payment ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t("order.paymentInstructions")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>{terms.payment.name}</p>
            <p className="whitespace-pre-line text-muted-foreground">
              {terms.payment.instructions}
            </p>
            <div className="flex flex-wrap gap-3">
              <CopyButton
                locale={locale}
                value={(
                  (order.purchaseTotalCents - order.creditAppliedCents) /
                  10 ** terms.precision
                ).toFixed(terms.precision)}
                label={t("order.copyAmount")}
              />
              <CopyButton
                locale={locale}
                value={order.referenceCode}
                label={t("order.copyRef")}
              />
            </div>
            <p>{textFor(locale).common.paymentReferenceNotice}</p>
          </CardContent>
        </Card>
      ) : null}
      {terms.pickup && (
        <p>
          {t("pickup")}: {terms.pickup.address} ·{" "}
          {formatLocalDate(terms.pickup.date, locale)} {terms.pickup.startTime}–
          {terms.pickup.endTime}
        </p>
      )}
      {order.purchaseTotalCents === 0 && (
        <p>{textFor(locale).common.noPaymentRequired}</p>
      )}
      {order.purchaseTotalCents > 0 && (
        <section className="mt-8">
          <h2>{textFor(locale).common.paymentEvidence}</h2>
          <p>
            {textFor(locale).common.evidenceCount.replace(
              "{count}",
              String(evidence.length),
            )}
          </p>
          <Uploader orderId={id} locale={locale} />
        </section>
      )}
      <p className="mt-8 text-sm text-muted-foreground">
        {t("order.bookmarkHint")}
      </p>
    </section>
  );
}
