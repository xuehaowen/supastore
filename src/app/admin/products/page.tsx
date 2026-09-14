import { VariantFields } from "@/app/interactive";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  products,
  productVariants,
  categories,
} from "@/infrastructure/db/schema";
import { staffIdentity, money } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { saveCategory, saveProduct, toggleAvailability } from "@/app/actions";
import { Field, Hidden, Notice, AdminNav } from "@/app/components";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
export default async function Products({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const staff = await staffIdentity().catch(() => redirect("/admin/login"));
  const rows = await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staff, "owner");
    return tx
      .select()
      .from(products)
      .innerJoin(productVariants, eq(productVariants.productId, products.id));
  });
  const groups = await db.select().from(categories);
  return (
    <main className="admin">
      <AdminNav />
      <p className="eyebrow">CATALOG MANAGEMENT</p>
      <h1>Products</h1>
      <p className="admin-description">
        Manage your catalog, pricing, and product availability.
      </p>
      <p>
        <Link href="/admin/categories" className="admin-edit-link">
          Manage categories →
        </Link>
      </p>
      <Notice error={(await searchParams).error} />
      <div className="admin-grid">
        <section>
          <h2>Products & availability</h2>
          {rows.map(({ products: p, product_variants: v }) => (
            <article className="queue-row" key={v.id}>
              <div>
                <h3>{p.title}</h3>
                <p>
                  {v.title} · {money(v.priceCents)} · {v.sku}
                </p>
                <Link
                  href={`/admin/products/${p.id}/edit`}
                  className="admin-edit-link"
                >
                  Edit product
                </Link>
              </div>
              <form action={toggleAvailability}>
                <Hidden name="productId" value={p.id} />
                <Hidden name="published" value={String(!p.isPublished)} />
                <Button type="submit" variant="outline">
                  {p.isPublished ? "Unpublish product" : "Publish product"}
                </Button>
              </form>
              <form action={toggleAvailability}>
                <Hidden name="variantId" value={v.id} />
                <Hidden name="available" value={String(!v.isAvailable)} />
                <Button type="submit" variant="outline">
                  {v.isAvailable ? "Mark unavailable" : "Make available"}
                </Button>
              </form>
            </article>
          ))}
        </section>
        <section className="panel">
          <h2>Add a product</h2>
          <form action={saveProduct}>
            <Field name="title" label="Title" />
            <Field name="handle" label="URL handle" />
            <label>
              Description
              <Textarea name="description" />
            </label>
            <Field name="zhTitle" label="Chinese title" required={false} />
            <label>
              Chinese description
              <Textarea name="zhDescription" />
            </label>
            <Field name="imageKey" label="Image asset key" required={false} />
            <label>
              Categories
              <NativeSelect name="categoryIds" multiple>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <VariantFields />
            <Button type="submit">Publish product</Button>
          </form>
          <h2>New category</h2>
          <form action={saveCategory}>
            <Field name="name" label="Category name" />
            <Field name="slug" label="Category handle" />
            <label>
              Parent category
              <NativeSelect name="parentId">
                <option value="">None</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <Button type="submit">Add category</Button>
          </form>
        </section>
      </div>
    </main>
  );
}
