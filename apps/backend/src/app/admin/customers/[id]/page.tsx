import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  customers,
  customerAddresses,
  orders,
  storeCreditAccounts,
} from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { staffIdentity, money } from "@/infrastructure/web";
import { AdminNav } from "@/app/admin/admin-nav";
import type { QuoteTerms } from "@/application/use-cases/get-quote";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@supastore/ui/table";
import { Badge } from "@supastore/ui/badge";
export default async function CustomerDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const staff = await staffIdentity().catch(() => redirect("/admin/login")),
    { id } = await params,
    query = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const page = Math.min(
    10000,
    Math.max(1, Number.parseInt(query.page || "1", 10) || 1),
  );
  const data = await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staff);
    const [customer] = await tx
      .select()
      .from(customers)
      .where(eq(customers.id, id));
    if (!customer) return null;
    const ownedOrders = await tx
      .select()
      .from(orders)
      .where(eq(orders.customerId, id))
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(26)
      .offset((page - 1) * 25);
    const addresses = await tx
      .select()
      .from(customerAddresses)
      .where(eq(customerAddresses.customerId, id))
      .limit(20);
    const credit = await tx
      .select()
      .from(storeCreditAccounts)
      .where(eq(storeCreditAccounts.customerId, id))
      .limit(10);
    return { customer, ownedOrders, addresses, credit };
  });
  if (!data) notFound();
  return (
    <>
      <AdminNav />
      <main tabIndex={-1} id="admin-content" className="admin">
        <Link href="/admin/customers">← Customers</Link>
        <h1>{data.customer.name || "Customer"}</h1>
        <p>{data.customer.email}</p>
        <section className="panel">
          <h2>Store credit</h2>
          {!data.credit.length && (
            <p className="admin-empty">No store credit account.</p>
          )}
          {data.credit.map((a) => (
            <p key={a.id}>
              <Link href={`/admin/store-credit/${a.id}`}>
                {money(
                  a.balanceCents - a.reservedCents,
                  a.currency,
                  a.precision,
                )}{" "}
                available · {money(a.reservedCents, a.currency, a.precision)}{" "}
                reserved
              </Link>
            </p>
          ))}
          <Link
            href={`/admin/store-credit?q=${encodeURIComponent(data.customer.email)}`}
          >
            Manage store credit
          </Link>
        </section>
        <section className="panel">
          <h2>Owned orders</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Date (UTC)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.ownedOrders.slice(0, 25).map((o) => {
                const terms = o.termsSnapshot as QuoteTerms;
                return (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Link href={`/admin/orders/${o.id}`}>
                        {o.referenceCode}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{o.lifecycleStatus}</Badge>
                    </TableCell>
                    <TableCell>
                      {money(
                        o.purchaseTotalCents,
                        terms.currency,
                        terms.precision,
                      )}
                    </TableCell>
                    <TableCell>
                      <time dateTime={o.createdAt.toISOString()}>
                        {o.createdAt.toLocaleDateString("en-US", {
                          timeZone: "UTC",
                        })}
                      </time>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!data.ownedOrders.length && (
                <TableRow>
                  <TableCell colSpan={4}>No owned orders.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <nav aria-label="Customer order pages" className="pager">
            {page > 1 && <Link href={`?page=${page - 1}`}>Previous</Link>}
            <span>Page {page}</span>
            {data.ownedOrders.length > 25 && (
              <Link href={`?page=${page + 1}`}>Next</Link>
            )}
          </nav>
        </section>
        <section className="panel">
          <h2>Address book</h2>
          {data.addresses.map((a) => (
            <p key={a.id}>
              {a.label} ·{" "}
              {[
                a.address.name,
                a.address.line1,
                a.address.city,
                a.address.country,
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
          ))}
          {!data.addresses.length && (
            <p className="admin-empty">No saved addresses.</p>
          )}
        </section>
      </main>
    </>
  );
}
