import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  customers,
  storeCreditAccounts,
  productVariants,
  variantStock,
} from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { staffIdentity } from "@/infrastructure/web";
import { AdminNav } from "@/app/admin/admin-nav";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@supastore/ui/table";
export default async function Reconciliation({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const staff = await staffIdentity().catch(() => redirect("/admin/login")),
    query = await searchParams;
  const page = Math.min(
    10000,
    Math.max(1, Number.parseInt(query.page || "1", 10) || 1),
  );
  const data = await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staff, "owner");
    const creditLedger = sql<number>`(select coalesce(sum(amount_cents),0) from store_credit_entries e where e.account_id=${storeCreditAccounts.id})`;
    const creditHolds = sql<number>`(select coalesce(sum(amount_cents),0) from store_credit_reservations r where r.account_id=${storeCreditAccounts.id} and r.status='active')`;
    const credits = await tx
      .select({
        account: storeCreditAccounts,
        customer: customers.email,
        ledger: creditLedger,
        holds: creditHolds,
      })
      .from(storeCreditAccounts)
      .innerJoin(customers, eq(customers.id, storeCreditAccounts.customerId))
      .where(
        sql`${storeCreditAccounts.balanceCents} <> ${creditLedger} or ${storeCreditAccounts.reservedCents} <> ${creditHolds}`,
      )
      .orderBy(asc(storeCreditAccounts.id))
      .limit(26)
      .offset((page - 1) * 25);
    const stockLedger = sql<number>`(select coalesce(sum(delta),0) from stock_movements m where m.variant_id=${variantStock.variantId})`;
    const stockHolds = sql<number>`(select coalesce(sum(quantity),0) from stock_reservations r where r.variant_id=${variantStock.variantId} and r.status='active')`;
    const stocks = await tx
      .select({
        stock: variantStock,
        sku: productVariants.sku,
        ledger: stockLedger,
        holds: stockHolds,
      })
      .from(variantStock)
      .innerJoin(
        productVariants,
        eq(productVariants.id, variantStock.variantId),
      )
      .where(
        sql`${variantStock.onHand} <> ${stockLedger} or ${variantStock.reserved} <> ${stockHolds}`,
      )
      .orderBy(asc(variantStock.variantId))
      .limit(26)
      .offset((page - 1) * 25);
    return { credits, stocks };
  });
  return (
    <>
      <AdminNav />
      <main tabIndex={-1} id="admin-content" className="admin">
        <h1>Credit & inventory reconciliation</h1>
        <p>
          Compare every account and stock count with its immutable entries and
          active reservations. Differences require owner investigation; this
          report makes no corrections.
        </p>
        <section className="panel">
          <h2>Credit discrepancies</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Recorded balance</TableHead>
                <TableHead>Ledger balance</TableHead>
                <TableHead>Reserved</TableHead>
                <TableHead>Active holds</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.credits.slice(0, 25).map((c) => (
                <TableRow key={c.account.id}>
                  <TableCell>
                    <Link href={`/admin/store-credit/${c.account.id}`}>
                      {c.customer}
                    </Link>
                    <small>Amounts in minor currency units</small>
                  </TableCell>
                  <TableCell>{c.account.balanceCents}</TableCell>
                  <TableCell>{Number(c.ledger)}</TableCell>
                  <TableCell>{c.account.reservedCents}</TableCell>
                  <TableCell>{Number(c.holds)}</TableCell>
                </TableRow>
              ))}
              {!data.credits.length && (
                <TableRow>
                  <TableCell colSpan={5}>No credit discrepancies.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>
        <section className="panel">
          <h2>Inventory discrepancies</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Recorded quantity</TableHead>
                <TableHead>Movement balance</TableHead>
                <TableHead>Reserved</TableHead>
                <TableHead>Active holds</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.stocks.slice(0, 25).map((s) => (
                <TableRow key={s.stock.variantId}>
                  <TableCell>
                    <Link href={`/admin/inventory/${s.stock.variantId}`}>
                      {s.sku}
                    </Link>
                  </TableCell>
                  <TableCell>{s.stock.onHand}</TableCell>
                  <TableCell>{Number(s.ledger)}</TableCell>
                  <TableCell>{s.stock.reserved}</TableCell>
                  <TableCell>{Number(s.holds)}</TableCell>
                </TableRow>
              ))}
              {!data.stocks.length && (
                <TableRow>
                  <TableCell colSpan={5}>No inventory discrepancies.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>
        <nav className="pager" aria-label="Reconciliation pages">
          {page > 1 && <Link href={`?page=${page - 1}`}>Previous</Link>}
          <span>Page {page}</span>
          {(data.credits.length > 25 || data.stocks.length > 25) && (
            <Link href={`?page=${page + 1}`}>Next</Link>
          )}
        </nav>
      </main>
    </>
  );
}
