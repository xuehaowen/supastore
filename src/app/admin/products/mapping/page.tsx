import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq, isNull } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import { products, productVariants } from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { staffIdentity } from "@/infrastructure/web";
import { AdminNav } from "@/app/admin/admin-nav";
export default async function LegacyMapping({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const staff = await staffIdentity().catch(() => redirect("/admin/login")), query = await searchParams;
  const page = Math.min(10000, Math.max(1, Number.parseInt(query.page || "1", 10) || 1));
  const rows = await db.transaction(async tx => { await verifyStaffInTransaction(tx, staff, "owner"); return tx.select({ product: products, variant: productVariants }).from(productVariants).innerJoin(products, eq(products.id, productVariants.productId)).where(isNull(productVariants.combinationKey)).orderBy(asc(products.title), asc(productVariants.sku)).limit(26).offset((page - 1) * 25); });
  return <main className="admin"><AdminNav /><h1>Legacy option mapping</h1><p>This read-only report identifies variants without a canonical option combination. Existing IDs, SKUs, prices, and labels stay in place. Assign each legacy variant explicitly in the product option preview or supply its stable option codes in CSV.</p><section className="panel"><div className="admin-table-scroll"><table className="admin-data-table"><thead><tr><th>Product</th><th>Variant / SKU</th><th>Legacy properties</th><th>Action</th></tr></thead><tbody>{rows.slice(0, 25).map(r => <tr key={r.variant.id}><td>{r.product.title}</td><td>{r.variant.title}<p>{r.variant.sku}</p></td><td>{Object.entries(r.variant.attributes || {}).map(([key, value]) => `${key}: ${String(value)}`).join(" · ") || "No legacy properties"}</td><td><Link href={`/admin/products/${r.product.id}/options`}>Review mapping</Link></td></tr>)}</tbody></table></div>{!rows.length && <p>No unmapped variants.</p>}</section><nav aria-label="Mapping report pages" className="pager">{page > 1 && <Link href={`?page=${page - 1}`}>Previous</Link>}<span>Page {page}</span>{rows.length > 25 && <Link href={`?page=${page + 1}`}>Next</Link>}</nav></main>;
}
