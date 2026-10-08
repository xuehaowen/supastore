import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  products,
  productCollections,
  collectionMemberships,
} from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { staffIdentity } from "@/infrastructure/web";
import { AdminNav } from "@/app/admin/admin-nav";
import { Field, Hidden, Notice } from "@/app/components";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { changeProductCollectionAction } from "@/app/admin/catalog-actions";
export default async function Organization({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; saved?: string; error?: string }>;
}) {
  const staff = await staffIdentity().catch(() => redirect("/admin/login")),
    { id } = await params,
    query = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staff, "owner");
    const [product] = await tx
      .select()
      .from(products)
      .where(eq(products.id, id));
    if (!product) return null;
    const members = await tx
      .select({
        collection: productCollections,
        membership: collectionMemberships,
      })
      .from(collectionMemberships)
      .innerJoin(
        productCollections,
        eq(productCollections.id, collectionMemberships.collectionId),
      )
      .where(eq(collectionMemberships.productId, id))
      .limit(20);
    const pattern = `%${(query.q || "").slice(0, 100).replace(/[\\%_]/g, "\\$&")}%`;
    const candidates = await tx
      .select()
      .from(productCollections)
      .where(
        sql`${productCollections.title} ilike ${pattern} and not exists (select 1 from product_collection_memberships m where m.collection_id=${productCollections.id} and m.product_id=${id})`,
      )
      .orderBy(asc(productCollections.title), asc(productCollections.id))
      .limit(25);
    return { product, members, candidates };
  });
  if (!data) notFound();
  const identity = (collectionId: string, revision: number) => (
    <>
      <Hidden name="productId" value={id} />
      <Hidden name="collectionId" value={collectionId} />
      <Hidden name="revision" value={String(revision)} />
    </>
  );
  return (
    <main className="admin">
      <AdminNav />
      <Link href={`/admin/products/${id}/edit`}>← Product editor</Link>
      <h1>Collections · {data.product.title}</h1>
      <p>A product can appear in up to 20 collections.</p>
      <Notice error={query.error} />
      {query.saved && (
        <Alert>
          <AlertDescription>Product collections updated.</AlertDescription>
        </Alert>
      )}
      <section className="panel">
        <h2>Assigned collections</h2>
        {data.members.map(({ collection: c, membership: m }) => (
          <form
            key={c.id}
            action={changeProductCollectionAction}
            className="catalog-remove-row"
          >
            {identity(c.id, c.revision)}
            <Link href={`/admin/collections/${c.id}`}>{c.title}</Link>
            <Field
              name="sortOrder"
              label={`Position in ${c.title}`}
              type="number"
              value={m.sortOrder}
            />
            <Button type="submit">Save position</Button>
            <Button name="remove" value="true" type="submit" variant="outline">
              Remove membership
            </Button>
          </form>
        ))}
        {!data.members.length && <p>No collection memberships.</p>}
      </section>
      <section className="panel">
        <h2>Add to collection</h2>
        <form method="get" className="filter-bar">
          <Field
            name="q"
            label="Find collection"
            value={query.q || ""}
            required={false}
          />
          <Button type="submit">Search collections</Button>
        </form>
        {data.candidates.map((c) => (
          <form
            key={c.id}
            action={changeProductCollectionAction}
            className="catalog-remove-row"
          >
            {identity(c.id, c.revision)}
            <Hidden name="sortOrder" value="0" />
            <span>
              {c.title} · {c.isPublished ? "Published" : "Hidden"}
            </span>
            <Button type="submit">Add to collection</Button>
          </form>
        ))}
      </section>
    </main>
  );
}
