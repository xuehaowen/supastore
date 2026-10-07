import { parseLedgerCursor, encodeLedgerCursor, ledgerTimestamp, ledgerBoundary } from "@/infrastructure/db/ledger-cursor";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq, getTableColumns } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  products,
  productVariants,
  variantStock,
  stockMovements,
  stockReservations,
  orders,
} from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { staffIdentity } from "@/infrastructure/web";
import { AdminNav } from "@/app/admin/admin-nav";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
export default async function StockHistory({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ after?: string }>;
}) {
  const staff = await staffIdentity().catch(() => redirect("/admin/login")),
    { id } = await params,
    query = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const cursor = parseLedgerCursor(query.after);
  const data = await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staff);
    const [row] = await tx
      .select({
        variant: productVariants,
        product: products,
        stock: variantStock,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .leftJoin(variantStock, eq(variantStock.variantId, productVariants.id))
      .where(eq(productVariants.id, id));
    if (!row) return null;
    const movements = await tx
      .select({ ...getTableColumns(stockMovements), cursorTimestamp: ledgerTimestamp(stockMovements.createdAt) })
      .from(stockMovements)
      .where(and(eq(stockMovements.variantId, id), ledgerBoundary(stockMovements.createdAt, stockMovements.id, cursor)))
      .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
      .limit(26);
    const reservations = await tx
      .select({
        reservation: stockReservations,
        reference: orders.referenceCode,
      })
      .from(stockReservations)
      .innerJoin(orders, eq(orders.id, stockReservations.orderId))
      .where(eq(stockReservations.variantId, id))
      .orderBy(desc(stockReservations.createdAt), desc(stockReservations.id))
      .limit(25);
    return { ...row, movements, reservations };
  });
  if (!data) notFound();
  return (
    <main className="admin">
      <AdminNav />
      <Link href="/admin/inventory">← Inventory</Link>
      <h1>
        {data.product.title} · {data.variant.title}
      </h1>
      <p>
        {data.variant.sku} ·{" "}
        {data.stock?.trackingEnabled
          ? `${data.stock.onHand} on hand · ${data.stock.reserved} reserved · ${Math.max(0, data.stock.onHand - data.stock.reserved)} available`
          : "Stock tracking disabled"}
      </p>
      <section className="panel">
        <h2>Stock movement history</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Quantity change</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="text-right">Order</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.movements.slice(0, 25).map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <time dateTime={m.createdAt.toISOString()}>
                    {m.createdAt.toLocaleString()}
                  </time>
                </TableCell>
                <TableCell className="font-medium">
                  {m.delta > 0 ? `+${m.delta}` : m.delta}
                </TableCell>
                <TableCell>{m.reason}</TableCell>
                <TableCell className="text-right">
                  {m.orderId ? (
                    <Link href={`/admin/orders/${m.orderId}`} className="admin-edit-link">
                      View order
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!data.movements.length && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No stock movements.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <nav className="pager" aria-label="Stock movement pages">
          {cursor && <Link href="?">Latest movements</Link>}
          {data.movements.length > 25 && (
            <Link href={`?after=${encodeLedgerCursor(data.movements[24]!.cursorTimestamp, data.movements[24]!.id)}`}>Older movements</Link>
          )}
        </nav>
      </section>
      <section className="panel">
        <h2>Recent order reservations</h2>
        {data.reservations.map((r) => (
          <p key={r.reservation.id}>
            <Link href={`/admin/orders/${r.reservation.orderId}`}>
              {r.reference}
            </Link>{" "}
            · {r.reservation.quantity} units · {r.reservation.status}
          </p>
        ))}
      </section>
    </main>
  );
}
