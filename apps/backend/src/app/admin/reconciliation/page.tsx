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
    <main className="admin">
      <AdminNav />
      <h1>Credit & inventory reconciliation</h1>
      <p>
        Compare every account and stock count with its immutable entries and
        active reservations. Differences require owner investigation; this
        report makes no corrections.
      </p>
      <section className="panel">
        <h2>Credit discrepancies</h2>
        {data.credits.slice(0, 25).map((c) => (
          <p key={c.account.id}>
            <Link href={`/admin/store-credit/${c.account.id}`}>
              {c.customer}
            </Link>{" "}
            · Recorded balance {c.account.balanceCents}; ledger{" "}
            {Number(c.ledger)} · Reserved {c.account.reservedCents}; holds{" "}
            {Number(c.holds)}
          </p>
        ))}
        {!data.credits.length && <p>No credit discrepancies.</p>}
      </section>
      <section className="panel">
        <h2>Inventory discrepancies</h2>
        {data.stocks.slice(0, 25).map((s) => (
          <p key={s.stock.variantId}>
            <Link href={`/admin/inventory/${s.stock.variantId}`}>{s.sku}</Link>{" "}
            · Recorded quantity {s.stock.onHand}; movements {Number(s.ledger)} ·
            Reserved {s.stock.reserved}; holds {Number(s.holds)}
          </p>
        ))}
        {!data.stocks.length && <p>No inventory discrepancies.</p>}
      </section>
      <nav className="pager" aria-label="Reconciliation pages">
        {page > 1 && <Link href={`?page=${page - 1}`}>Previous</Link>}
        <span>Page {page}</span>
        {(data.credits.length > 25 || data.stocks.length > 25) && (
          <Link href={`?page=${page + 1}`}>Next</Link>
        )}
      </nav>
    </main>
  );
}
