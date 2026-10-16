import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq, isNull } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import { products, productVariants } from "@/infrastructure/db/schema";
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
} from "@supastore/ui/table";

export default async function LegacyMapping({
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
    await verifyStaffInTransaction(tx, staff, "owner");
    return tx
      .select({ product: products, variant: productVariants })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(isNull(productVariants.combinationKey))
      .orderBy(asc(products.title), asc(productVariants.sku))
      .limit(26)
      .offset((page - 1) * 25);
  });

  return (
    <>
      <AdminNav />
      <main tabIndex={-1} id="admin-content" className="admin">
        <h1>Legacy option mapping</h1>
        <p className="admin-description">
          This read-only report identifies variants without a canonical option
          combination. Existing IDs, SKUs, prices, and labels stay in place.
          Assign each legacy variant explicitly in the product option preview or
          supply its stable option codes in CSV.
        </p>
        <section className="panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Variant / SKU</TableHead>
                <TableHead>Legacy properties</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 25).map((r) => (
                <TableRow key={r.variant.id}>
                  <TableCell className="font-medium">
                    {r.product.title}
                  </TableCell>
                  <TableCell>
                    <div>{r.variant.title}</div>
                    <p className="text-xs text-muted-foreground">
                      {r.variant.sku}
                    </p>
                  </TableCell>
                  <TableCell>
                    {Object.entries(r.variant.attributes || {})
                      .map(([key, value]) => `${key}: ${String(value)}`)
                      .join(" · ") || "No legacy properties"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/admin/products/${r.product.id}/options`}
                      className="admin-edit-link"
                    >
                      Review mapping
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center text-muted-foreground"
                  >
                    No unmapped variants.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>
        <nav aria-label="Mapping report pages" className="pager">
          {page > 1 && <Link href={`?page=${page - 1}`}>Previous</Link>}
          <span>Page {page}</span>
          {rows.length > 25 && <Link href={`?page=${page + 1}`}>Next</Link>}
        </nav>
      </main>
    </>
  );
}
