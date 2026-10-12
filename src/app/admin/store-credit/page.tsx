import Link from "next/link";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  customers,
  storeCreditAccounts,
  storeCreditEntries,
} from "@/infrastructure/db/schema";
import { staffIdentity, money } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { AdminNav } from "@/app/admin/admin-nav";
import { AdminDialog } from "@/app/admin/admin-dialog";
import { Field, Hidden, Notice } from "@/app/components";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { issueCreditAction } from "@/app/admin/credit-actions";
export default async function CreditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; error?: string }>;
}) {
  const staff = await staffIdentity().catch(() => redirect("/admin/login"));
  const query = await searchParams;
  const search = (query.q || "").slice(0, 120);
  const page = Math.min(
    10000,
    Math.max(1, Number.parseInt(query.page || "1", 10) || 1),
  );
  const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const result = await db.transaction(async (tx) => {
    const identity = await verifyStaffInTransaction(tx, staff);
    const rows = await tx
      .select({
        customer: customers,
        account: storeCreditAccounts,
        lastActivity: sql<Date | null>`(select max(created_at) from store_credit_entries where account_id = ${storeCreditAccounts.id})`,
      })
      .from(storeCreditAccounts)
      .innerJoin(customers, eq(customers.id, storeCreditAccounts.customerId))
      .where(
        sql`(${customers.name} ilike ${pattern} or ${customers.email} ilike ${pattern})`,
      )
      .orderBy(asc(customers.name), asc(storeCreditAccounts.id))
      .limit(26)
      .offset((page - 1) * 25);
    const candidates = await tx
      .select()
      .from(customers)
      .where(
        sql`(${customers.name} ilike ${pattern} or ${customers.email} ilike ${pattern})`,
      )
      .orderBy(asc(customers.name), asc(customers.id))
      .limit(25);
    return { rows, candidates, owner: identity.role === "owner" };
  });
  const href = (p: number) =>
    `?${new URLSearchParams({ q: search, page: String(p) })}`;
  return (
    <main className="admin">
      <AdminNav />
      <h1>Store credit</h1>
      <p className="admin-description">
        Issue credit with a reason and keep an immutable ledger. Available
        balances exclude pending order reservations. Only verified customer
        accounts can redeem credit at checkout.
      </p>
      <Notice error={query.error} />
      <form method="get" className="filter-bar">
        <Field name="q" label="Find customer" value={search} required={false} />
        <Button type="submit">Search</Button>
      </form>
      {result.owner && (
        <AdminDialog
          trigger="Issue credit"
          title="Issue store credit"
          description="Credit is a customer balance, not a sale or discount. Review the customer and amount before issuing."
        >
          <form action={issueCreditAction}>
            <Hidden name="requestKey" value={randomUUID()} />
            <label>
              Customer
              <NativeSelect name="customerId" required defaultValue="">
                <option value="">Choose customer</option>
                {result.candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.email}
                    {!c.authUserId ? " (unlinked)" : ""}
                  </option>
                ))}
              </NativeSelect>
            </label>
            {!result.candidates.length && (
              <p>
                Customers appear after verified sign-in. Use the search to find
                an existing customer.
              </p>
            )}
            <Field
              name="amountCents"
              label="Credit amount in minor units"
              type="number"
            />
            <Field name="reason" label="Credit reason" />
            <Button type="submit">Issue store credit</Button>
          </form>
        </AdminDialog>
      )}
      <section className="panel">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Available</TableHead>
              <TableHead>Reserved</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead>Last activity</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows
              .slice(0, 25)
              .map(({ customer: c, account: a, lastActivity }) => (
                <TableRow key={a.id}>
                  <TableCell>
                    {c.name}
                    <p>{c.email}</p>
                  </TableCell>
                  <TableCell>
                    {money(
                      a.balanceCents - a.reservedCents,
                      a.currency,
                      a.precision,
                    )}
                  </TableCell>
                  <TableCell>
                    {money(a.reservedCents, a.currency, a.precision)}
                  </TableCell>
                  <TableCell>{a.currency}</TableCell>
                  <TableCell>
                    {lastActivity
                      ? new Date(lastActivity).toLocaleDateString("en-US", {
                          timeZone: "UTC",
                        })
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Link href={`/admin/store-credit/${a.id}`}>
                      View ledger
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            {!result.rows.length && (
              <TableRow>
                <TableCell colSpan={6}>
                  No credit accounts match this search.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>
      <nav className="pager" aria-label="Credit account pages">
        {page > 1 && <Link href={href(page - 1)}>Previous</Link>}
        <span>Page {page}</span>
        {result.rows.length > 25 && <Link href={href(page + 1)}>Next</Link>}
      </nav>
    </main>
  );
}
