import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import { orders } from "@/infrastructure/db/schema";
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
export default async function PendingHolds({
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
  const rows = await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staff);
    return tx
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.lifecycleStatus, "unpaid"),
          sql`${orders.createdAt} < now() - interval '24 hours'`,
          sql`(exists (select 1 from stock_reservations s where s.order_id=${orders.id} and s.status='active') or exists (select 1 from store_credit_reservations c where c.order_id=${orders.id} and c.status='active'))`,
        ),
      )
      .orderBy(asc(orders.createdAt), asc(orders.id))
      .limit(26)
      .offset((page - 1) * 25);
  });
  return (
    <>
      <AdminNav />
      <main tabIndex={-1} id="admin-content" className="admin">
        <Link href="/admin/inventory">← Inventory</Link>
        <h1>Pending payment holds</h1>
        <p>
          These unpaid orders have held stock or credit for more than 24 hours.
          Verify late transfers before recording payment or cancelling an order.
          Holds remain active until explicit resolution.
        </p>
        <section className="panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Pending since (UTC)</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 25).map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Link href={`/admin/orders/${o.id}`}>
                      {o.referenceCode}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {o.guestName}
                    <small>{o.guestEmail}</small>
                  </TableCell>
                  <TableCell>
                    <time dateTime={o.createdAt.toISOString()}>
                      {o.createdAt.toLocaleString("en-US", { timeZone: "UTC" })}
                    </time>
                  </TableCell>
                  <TableCell>
                    <Link href={`/admin/orders/${o.id}`}>Review hold</Link>
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={4}>No overdue holds.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>
        <nav className="pager" aria-label="Pending hold pages">
          {page > 1 && <Link href={`?page=${page - 1}`}>Previous</Link>}
          <span>Page {page}</span>
          {rows.length > 25 && <Link href={`?page=${page + 1}`}>Next</Link>}
        </nav>
      </main>
    </>
  );
}
