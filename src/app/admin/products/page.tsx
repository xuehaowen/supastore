import { VariantFields } from "@/app/interactive";
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
      <h1>Your collection</h1>
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
              </div>
              <form action={toggleAvailability}>
                <Hidden name="productId" value={p.id} />
                <Hidden name="published" value={String(!p.isPublished)} />
                <button className="secondary">
                  {p.isPublished ? "Unpublish product" : "Publish product"}
                </button>
              </form>
              <form action={toggleAvailability}>
                <Hidden name="variantId" value={v.id} />
                <Hidden name="available" value={String(!v.isAvailable)} />
                <button className="secondary">
                  {v.isAvailable ? "Mark unavailable" : "Make available"}
                </button>
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
              <textarea name="description" />
            </label>
            <Field name="zhTitle" label="Chinese title" required={false} />
            <label>
              Chinese description
              <textarea name="zhDescription" />
            </label>
            <Field name="imageKey" label="Image asset key" required={false} />
            <label>
              Categories
              <select name="categoryIds" multiple>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <VariantFields />
            <button>Publish product</button>
          </form>
          <h2>New category</h2>
          <form action={saveCategory}>
            <Field name="name" label="Category name" />
            <Field name="slug" label="Category handle" />
            <label>
              Parent category
              <select name="parentId">
                <option value="">None</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <button>Add category</button>
          </form>
        </section>
      </div>
    </main>
  );
}
