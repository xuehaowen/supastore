import Link from "next/link";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  products,
  productVariants,
  variantStock,
} from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { staffIdentity } from "@/infrastructure/web";
import { AdminNav } from "@/app/admin/admin-nav";
import { AdminDialog } from "@/app/admin/admin-dialog";
import { Field, Hidden, Notice } from "@/app/components";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { countStockAction } from "@/app/admin/inventory-actions";
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    page?: string;
    error?: string;
    saved?: string;
  }>;
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
        product: products,
        variant: productVariants,
        stock: variantStock,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .leftJoin(variantStock, eq(variantStock.variantId, productVariants.id))
      .where(
        and(
          sql`(${products.title} ilike ${pattern} or ${productVariants.sku} ilike ${pattern})`,
          query.status === "shortage"
            ? sql`${variantStock.trackingEnabled} and ${variantStock.onHand} < ${variantStock.reserved}`
            : query.status === "low"
              ? sql`${variantStock.trackingEnabled} and ${variantStock.onHand} - ${variantStock.reserved} <= 5`
              : undefined,
        ),
      )
      .orderBy(asc(products.title), asc(productVariants.sku))
      .limit(26)
      .offset((page - 1) * 25);
    return { rows, owner: identity.role === "owner" };
  });
  const href = (p: number) =>
    `?${new URLSearchParams({ q: search, status: query.status || "", page: String(p) })}`;
  return (
    <main className="admin">
      <AdminNav />
      <h1>Inventory</h1>
      <p className="admin-description">
        Available to sell is counted stock minus active order reservations.
        Untracked variants have no quantity limit. Pending manual payments keep
        their reservations until explicit cancellation.
      </p>
      <Link href="/admin/inventory/pending">Review overdue payment holds</Link>
      <Notice error={query.error} />
      {query.saved && <p role="status">Stock count recorded.</p>}
      <form method="get" className="filter-bar">
        <Field
          name="q"
          label="Search inventory"
          value={search}
          required={false}
        />
        <label>
          Status
          <NativeSelect name="status" defaultValue={query.status || ""}>
            <option value="">All variants</option>
            <option value="low">Low stock (5 or fewer)</option>
            <option value="shortage">Reservation shortage</option>
          </NativeSelect>
        </label>
        <Button type="submit">Filter</Button>
      </form>
      <section className="panel">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product / variant</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>On hand</TableHead>
              <TableHead>Reserved</TableHead>
              <TableHead>Available</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows
              .slice(0, 25)
              .map(({ product, variant: v, stock: s }) => (
                <TableRow key={v.id}>
                  <TableCell>
                    <Link href={`/admin/products/${product.id}/edit`}>
                      {product.title}
                    </Link>
                    <p>{v.title}</p>
                  </TableCell>
                  <TableCell>{v.sku}</TableCell>
                  <TableCell>
                    {s?.trackingEnabled ? s.onHand : "Untracked"}
                  </TableCell>
                  <TableCell>{s?.reserved || 0}</TableCell>
                  <TableCell>
                    {s?.trackingEnabled
                      ? s.onHand < s.reserved
                        ? "Shortage · handoff blocked"
                        : s.onHand - s.reserved
                      : "Unlimited"}
                  </TableCell>
                  <TableCell>
                    <Link href={`/admin/inventory/${v.id}`}>Stock history</Link>
                    {result.owner && (
                      <AdminDialog
                        trigger="Record count"
                        title={`Stock count · ${v.sku}`}
                        description="Record the physical quantity and a reason. A count below reservations creates a shortage; it does not release orders."
                      >
                        <form action={countStockAction}>
                          <Hidden name="variantId" value={v.id} />
                          <Hidden
                            name="revision"
                            value={String(s?.revision || 1)}
                          />
                          <Hidden name="requestKey" value={randomUUID()} />
                          <label className="check">
                            <Checkbox
                              name="tracking"
                              defaultChecked={s?.trackingEnabled || false}
                            />
                            Track stock
                          </label>
                          <Field
                            name="onHand"
                            label="Physical quantity"
                            type="number"
                            value={s?.onHand || 0}
                          />
                          <Field name="reason" label="Count reason" />
                          <Button type="submit">Save stock count</Button>
                        </form>
                      </AdminDialog>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            {!result.rows.length && (
              <TableRow>
                <TableCell colSpan={6}>
                  No variants match this filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>
      <nav className="pager" aria-label="Inventory pages">
        {page > 1 && <Link href={href(page - 1)}>Previous</Link>}
        <span>Page {page}</span>
        {result.rows.length > 25 && <Link href={href(page + 1)}>Next</Link>}
      </nav>
    </main>
  );
}
