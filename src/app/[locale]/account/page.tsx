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
  searchParams: Promise<{ error?: string; page?: string }>;
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
  const account = session ? await customerAccount(session.user.id, page) : null;

  return (
    <section className="account-shell">
      <Notice error={query.error} />
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
                    (locale === "zh" ? "客户" : "Customer")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {session.user.email}
                </p>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                {locale === "zh"
                  ? "以访客身份下的订单将保密于其专属订单链接中。您随时可以通过查找订单页面找回。"
                  : "Orders placed as a guest remain private to their order link. You can always find one from the recovery page."}
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
                  href="/recover"
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
                    )}
                  </p>
                  <p>
                    {t("account.reservedCredit")}:{" "}
                    {money(
                      account.credit.account.reservedCents,
                      account.credit.account.currency,
                      account.credit.account.precision,
                    )}
                  </p>
                  {!account.credit.reconciled && (
                    <p>
                      {locale === "zh"
                        ? "账户余额正在核对中。使用余额前请联系客服。"
                        : "Balance reconciliation needs store review. Contact support before applying credit."}
                    </p>
                  )}
                  <h3>{locale === "zh" ? "近期明细" : "Recent activity"}</h3>
                  {account.credit.entries.map((entry) => (
                    <p key={entry.id}>
                      {entry.createdAt.toLocaleDateString(locale)} ·{" "}
                      {entry.reason} ·{" "}
                      {money(
                        entry.amountCents,
                        account.credit!.account.currency,
                        account.credit!.account.precision,
                      )}
                    </p>
                  ))}
                </>
              ) : (
                <p>{t("account.noCredit")}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <h2>{t("account.orderHistory")}</h2>
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
                      {order.referenceCode} · {order.lifecycleStatus} ·{" "}
                      {money(
                        order.purchaseTotalCents,
                        terms.currency,
                        terms.precision,
                      )}
                    </span>
                    <Button type="submit" variant="outline">
                      {t("account.viewOrder")}
                    </Button>
                  </form>
                );
              })}
              <nav aria-label="Order history pages" className="flex gap-4 mt-4">
                {page > 1 && (
                  <Link href={`?page=${page - 1}`}>
                    {locale === "zh" ? "上一页" : "Previous"}
                  </Link>
                )}
                <span>
                  {locale === "zh" ? `第 ${page} 页` : `Page ${page}`}
                </span>
                {account.hasNext && (
                  <Link href={`?page=${page + 1}`}>
                    {locale === "zh" ? "下一页" : "Next"}
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
