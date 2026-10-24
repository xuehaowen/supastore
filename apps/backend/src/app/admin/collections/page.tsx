import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import { productCollections } from "@/infrastructure/db/schema";
import { staffIdentity } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { AdminNav } from "@/app/admin/admin-nav";
import { CatalogTabs } from "@/app/admin/catalog-tabs";
import { AdminDialog } from "@/app/admin/admin-dialog";
import { Field, Notice } from "@/app/components";
import { Button } from "@supastore/ui/button";
import { Checkbox } from "@supastore/ui/checkbox";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@supastore/ui/table";
import { Badge } from "@supastore/ui/badge";
import { saveCollectionAction } from "@/app/admin/catalog-actions";
import { NavigationOrder } from "../navigation-order";
export default async function Collections({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; error?: string; page?: string }>;
}) {
  const staff = await staffIdentity().catch(() => redirect("/admin/login"));
  const query = await searchParams;
  const search = query.q?.trim().slice(0, 120) ?? "";
  const page = /^\d{1,5}$/.test(query.page ?? "")
    ? Math.max(1, Number(query.page))
    : 1;
  const rows = await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staff, "owner");
    const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
    return tx
      .select({
        collection: productCollections,
        count: sql<number>`(select count(*)::int from product_collection_memberships m where m.collection_id=${sql`${productCollections.id}`})`,
      })
      .from(productCollections)
      .where(sql`${productCollections.title} ilike ${pattern}`)
      .orderBy(
        asc(productCollections.sortOrder),
        asc(productCollections.handle),
        asc(productCollections.id),
      )
      .limit(26)
      .offset((page - 1) * 25);
  });
  const pageUrl = (target: number) =>
    `/admin/collections?${new URLSearchParams({ q: search, page: String(target) })}`;
  return (
    <>
      <AdminNav />
      <main tabIndex={-1} id="admin-content" className="admin">
        <h1>Collections</h1>
        <p className="admin-description">
          Curate product groups for your storefront. Products can belong to
          multiple collections. Storefront order uses lower numbers first; ties
          use the handle. Homepage featured collections keep their separate
          order in Storefront settings.
        </p>
        <div className="admin-page-actions">
          <AdminDialog trigger="Add collection" title="Add collection">
            <form action={saveCollectionAction} className="grid gap-4">
              <Field name="title" label="Collection title" />
              <Field name="handle" label="Collection handle" />
              <Field name="description" label="Description" required={false} />
              <label className="flex items-center gap-2">
                <Checkbox name="published" /> Publish collection
              </label>
              <Button type="submit">Create collection</Button>
            </form>
          </AdminDialog>
        </div>
        <CatalogTabs />
        <Notice error={query.error} />
        <form method="get" className="admin-filter-bar">
          <Field
            name="q"
            label="Search collections"
            value={search}
            required={false}
          />
          <Button type="submit">Search</Button>
        </form>
        <section className="panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Collection</TableHead>
                <TableHead>Handle</TableHead>
                <TableHead>Products</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Storefront order</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 25).map(({ collection, count }) => (
                <TableRow key={collection.id}>
                  <TableCell>{collection.title}</TableCell>
                  <TableCell>/{collection.handle}</TableCell>
                  <TableCell>{count}</TableCell>
                  <TableCell>
                    <Badge
                      variant={collection.isPublished ? "default" : "secondary"}
                    >
                      {collection.isPublished ? "Published" : "Draft"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <NavigationOrder
                      kind="collection"
                      id={collection.id}
                      name={collection.title}
                      position={collection.sortOrder}
                      search={search}
                      page={page}
                    />
                  </TableCell>
                  <TableCell>
                    <Link href={`/admin/collections/${collection.id}`}>
                      Manage
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={6}>
                    No collections match this search.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <nav className="admin-pagination" aria-label="Collection pages">
            {page > 1 ? (
              <Link href={pageUrl(page - 1)}>Previous</Link>
            ) : (
              <span />
            )}
            <span>Page {page}</span>
            {rows.length > 25 ? (
              <Link href={pageUrl(page + 1)}>Next</Link>
            ) : (
              <span />
            )}
          </nav>
        </section>
      </main>
    </>
  );
}
