import { statusLabel, activityLabel } from "@/i18n/customer";
import { textFor } from "@/i18n/messages";
import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/infrastructure/auth";
import {
  AuthForm,
  SessionVerificationGuard,
  SignOutButton,
} from "@/app/interactive";
import { Card, CardContent } from "@/components/ui/card";
import { customerAccount } from "@/application/use-cases/customers/customer-ownership";
import {
  openOwnedOrderAction,
  saveAddressAction,
} from "@/app/customer-actions";
import { Field, Hidden, Notice } from "@/app/components";
import { Button } from "@/components/ui/button";
import { money } from "@/infrastructure/web";
import { AddressBook } from "@/app/address-book";
import { CustomerAuthTools } from "@/app/customer-auth";
import { getTranslations } from "next-intl/server";
export const metadata = { robots: { index: false, follow: false } };
import type { QuoteTerms } from "@/application/use-cases/get-quote";

export default async function Account({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    error?: string;
    page?: string;
    reference?: string;
    creditPage?: string;
  }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  const rawSession = await auth.api.getSession({ headers: await headers() });
  const session = rawSession?.user.emailVerified ? rawSession : null;
  const query = await searchParams;
  const page = Math.min(
    10000,
    Math.max(1, Number.parseInt(query.page || "1", 10) || 1),
  );
  const reference = (query.reference || "").trim().slice(0, 100);
  const creditPage = Math.min(
    10000,
    Math.max(1, Number.parseInt(query.creditPage || "1", 10) || 1),
  );
  const historyHref = (ordersPage: number, creditsPage: number) =>
    `?page=${ordersPage}&creditPage=${creditsPage}&reference=${encodeURIComponent(reference)}`;
  const account = session
    ? await customerAccount(session.user.id, page, reference, creditPage)
    : null;

  return (
    <section className="account-shell">
      <Notice error={query.error} locale={locale} />
      <div className="account-heading">
        <p className="eyebrow">{t("account.eyebrow")}</p>
        <h1>{session ? t("account.welcome") : t("account.guestIntro")}</h1>
        <p>
          {session ? t("account.sessionActive") : t("account.sessionInactive")}
        </p>
      </div>
      <Card className="account-card auth-card">
        <CardContent>
          {session ? (
            <div className="grid gap-5">
              <div className="rounded-xl bg-muted p-4">
                <p className="text-xs font-medium tracking-[0.12em] text-muted-foreground">
                  {t("account.signedInAs")}
                </p>
                <p className="mt-2 font-medium">
                  {account?.customer.name ||
                    session.user.name ||
                    textFor(locale).ui.customer}
                </p>
                <p className="text-sm text-muted-foreground">
                  {session.user.email}
                </p>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                {
                  textFor(locale).ui
                    .ordersPlacedAsAGuestRemainPrivateToTheirOrderLinkYouCanAlwaysFindOneFromTheRecoveryPage
                }
              </p>
              <CustomerAuthTools
                locale={locale}
                name={account?.customer.name || session.user.name}
                phone={account?.customer.phone || ""}
              />
              <div className="flex flex-wrap gap-3">
                <SignOutButton locale={locale} />
                <Link
                  className="inline-flex h-8 items-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted"
                  href={`/recover?locale=${locale}`}
                >
                  {t("account.findOrder")}
                </Link>
              </div>
            </div>
          ) : (
            <>
              {rawSession && <SessionVerificationGuard />}
              <AuthForm audience="customer" locale={locale} />
              <CustomerAuthTools locale={locale} />
            </>
          )}
        </CardContent>
      </Card>
      {account && (
        <div className="grid gap-6 mt-8">
          <Card>
            <CardContent>
              <h2>{t("account.storeCredit")}</h2>
              {account.credit ? (
                <>
                  <p>
                    {t("account.availableCredit")}:{" "}
                    {money(
                      account.credit.account.balanceCents -
                        account.credit.account.reservedCents,
                      account.credit.account.currency,
                      account.credit.account.precision,
                      locale,
                    )}
                  </p>
                  <p>
                    {t("account.reservedCredit")}:{" "}
                    {money(
                      account.credit.account.reservedCents,
                      account.credit.account.currency,
                      account.credit.account.precision,
                      locale,
                    )}
                  </p>
                  {!account.credit.reconciled && (
                    <p>
                      {
                        textFor(locale).ui
                          .balanceReconciliationNeedsStoreReviewContactSupportBeforeApplyingCredit
                      }
                    </p>
                  )}
                  <h3>{textFor(locale).ui.recentActivity}</h3>
                  {account.credit.entries.map((entry) => (
                    <p key={entry.id}>
                      {entry.createdAt.toLocaleDateString(locale)} ·{" "}
                      {activityLabel(entry.reason, locale)} ·{" "}
                      {money(
                        entry.amountCents,
                        account.credit!.account.currency,
                        account.credit!.account.precision,
                        locale,
                      )}
                    </p>
                  ))}
                  <nav
                    aria-label={textFor(locale).ui.recentActivity}
                    className="flex gap-4"
                  >
                    {creditPage > 1 && (
                      <Link href={historyHref(page, creditPage - 1)}>
                        {textFor(locale).ui.previous}
                      </Link>
                    )}
                    <span>
                      {textFor(locale).common.page.replace(
                        "{count}",
                        String(creditPage),
                      )}
                    </span>
                    {account.credit.hasNext && (
                      <Link href={historyHref(page, creditPage + 1)}>
                        {textFor(locale).ui.next}
                      </Link>
                    )}
                  </nav>
                </>
              ) : (
                <p>{t("account.noCredit")}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <h2>{t("account.orderHistory")}</h2>
              <form method="get">
                <label>
                  {locale === "zh" ? "订单编号" : "Order reference"}
                  <input
                    name="reference"
                    defaultValue={reference}
                    maxLength={100}
                  />
                </label>
                <Button type="submit">
                  {locale === "zh" ? "查找订单" : "Search orders"}
                </Button>
              </form>
              {!account.orders.length && <p>{t("account.noOrders")}</p>}
              {account.orders.map((order) => {
                const terms = order.termsSnapshot as QuoteTerms;
                return (
                  <form
                    key={order.id}
                    action={openOwnedOrderAction}
                    className="flex flex-wrap items-center justify-between gap-3 border-b py-4"
                  >
                    <Hidden name="locale" value={locale} />
                    <Hidden name="orderId" value={order.id} />
                    <span>
                      {order.referenceCode} ·{" "}
                      {statusLabel(order.lifecycleStatus, locale)} ·{" "}
                      {money(
                        order.purchaseTotalCents,
                        terms.currency,
                        terms.precision,
                        locale,
                      )}
                    </span>
                    <Button type="submit" variant="outline">
                      {t("account.viewOrder")}
                    </Button>
                  </form>
                );
              })}
              <nav
                aria-label={textFor(locale).common.orderPages}
                className="flex gap-4 mt-4"
              >
                {page > 1 && (
                  <Link href={historyHref(page - 1, creditPage)}>
                    {textFor(locale).ui.previous}
                  </Link>
                )}
                <span>
                  {textFor(locale).common.page.replace("{count}", String(page))}
                </span>
                {account.hasNext && (
                  <Link href={historyHref(page + 1, creditPage)}>
                    {textFor(locale).ui.next}
                  </Link>
                )}
              </nav>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <AddressBook locale={locale} addresses={account.addresses} />
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}
