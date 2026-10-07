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
        <p className="eyebrow">YOUR SUPASTORE</p>
        <h1>{session ? "Good to see you." : "A calmer way to check out."}</h1>
        <p>
          {session
            ? "Your account is signed in on this device."
            : "Save a verified account for a smoother return to the store."}
        </p>
      </div>
      <Card className="account-card auth-card">
        <CardContent>
          {session ? (
            <div className="grid gap-5">
              <div className="rounded-xl bg-muted p-4">
                <p className="text-xs font-medium tracking-[0.12em] text-muted-foreground">
                  SIGNED IN AS
                </p>
                <p className="mt-2 font-medium">
                  {account?.customer.name || session.user.name || "Customer"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {session.user.email}
                </p>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                Orders placed as a guest remain private to their order link. You
                can always find one from the recovery page.
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
                  Find an order
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
              <h2>Store credit</h2>
              {account.credit ? (
                <>
                  <p>
                    Available:{" "}
                    {money(
                      account.credit.account.balanceCents -
                        account.credit.account.reservedCents,
                      account.credit.account.currency,
                      account.credit.account.precision,
                    )}
                  </p>
                  <p>
                    Reserved for pending orders:{" "}
                    {money(
                      account.credit.account.reservedCents,
                      account.credit.account.currency,
                      account.credit.account.precision,
                    )}
                  </p>
                  {!account.credit.reconciled && (
                    <p>
                      Balance reconciliation needs store review. Contact support
                      before applying credit.
                    </p>
                  )}
                  <h3>Recent activity</h3>
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
                <p>No store credit yet.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <h2>{locale === "zh" ? "订单记录" : "Order history"}</h2>
              {!account.orders.length && (
                <p>
                  No owned orders yet. Orders placed while signed in appear
                  here. To add a guest order, open its private order link and
                  choose “Add to my account”.
                </p>
              )}
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
                      View order
                    </Button>
                  </form>
                );
              })}
              <nav aria-label="Order history pages" className="flex gap-4 mt-4">
                {page > 1 && <Link href={`?page=${page - 1}`}>Previous</Link>}
                <span>Page {page}</span>
                {account.hasNext && (
                  <Link href={`?page=${page + 1}`}>Next</Link>
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
