import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import { orders, orderReturns } from "@/infrastructure/db/schema";
import { staffIdentity } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { AdminNav } from "@/app/admin/admin-nav";
import { Field, Notice } from "@/app/components";
import { Button } from "@supastore/ui/button";
import { NativeSelect } from "@supastore/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@supastore/ui/table";
export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    page?: string;
    error?: string;
  }>;
}) {
  const staff = await staffIdentity().catch(() => redirect("/admin/login"));
  const query = await searchParams;
  const page = Math.min(
    10000,
    Math.max(1, Number.parseInt(query.page || "1", 10) || 1),
  );
  const search = (query.q || "").slice(0, 120),
    pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const status = [
    "requested",
    "approved",
    "received",
    "rejected",
    "cancelled",
  ].includes(query.status || "")
    ? query.status!
    : "";
  const rows = await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staff);
    return tx
      .select({ goodsReturn: orderReturns, order: orders })
      .from(orderReturns)
      .innerJoin(orders, eq(orders.id, orderReturns.orderId))
      .where(
        and(
          sql`(${orders.referenceCode} ilike ${pattern} or ${orders.guestEmail} ilike ${pattern})`,
          status ? sql`${orderReturns.status} = ${status}` : undefined,
        ),
      )
      .orderBy(desc(orderReturns.createdAt), desc(orderReturns.id))
      .limit(26)
      .offset((page - 1) * 25);
  });
  const href = (p: number) =>
    `?${new URLSearchParams({ q: search, status, page: String(p) })}`;
  return (
    <main className="admin">
      <AdminNav />
      <h1>Product returns</h1>
      <p className="admin-description">
        Goods receipt, inventory disposition, and refunds are separate steps.
        Receiving restockable goods does not authorize a refund.
      </p>
      <Notice error={query.error} />
      <form method="get" className="filter-bar">
        <Field
          name="q"
          label="Order or customer email"
          value={search}
          required={false}
        />
        <label>
          Status
          <NativeSelect name="status" defaultValue={status}>
            <option value="">All statuses</option>
            {["requested", "approved", "received", "rejected", "cancelled"].map(
              (s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ),
            )}
          </NativeSelect>
        </label>
        <Button type="submit">Filter</Button>
      </form>
      <section className="panel">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Requested</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, 25).map(({ goodsReturn: r, order: o }) => (
              <TableRow key={r.id}>
                <TableCell>{o.referenceCode}</TableCell>
                <TableCell>{o.guestName}</TableCell>
                <TableCell>
                  {r.createdAt.toLocaleDateString("en-US", { timeZone: "UTC" })}
                </TableCell>
                <TableCell>{r.status}</TableCell>
                <TableCell>
                  <Link href={`/admin/returns/${r.id}`}>Manage return</Link>
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={5}>No returns match this filter.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>
      <nav className="pager" aria-label="Return pages">
        {page > 1 && <Link href={href(page - 1)}>Previous</Link>}
        <span>Page {page}</span>
        {rows.length > 25 && <Link href={href(page + 1)}>Next</Link>}
      </nav>
    </main>
  );
}
