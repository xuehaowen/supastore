import { asc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/infrastructure/db";
import { categories } from "@/infrastructure/db/schema";
import { staffIdentity } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { AdminNav, Field, Hidden, Notice } from "@/app/components";
import { deleteCategory, editCategory, saveCategory } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const staff = await staffIdentity().catch(() => redirect("/admin/login"));
  const rows = await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staff, "owner");
    return tx
      .select()
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name));
  });
  return (
    <main className="admin">
      <AdminNav />
      <p className="eyebrow">CATALOG STRUCTURE</p>
      <h1>Categories</h1>
      <p className="admin-description">
        Organize products and maintain category handles and hierarchy.
      </p>
      <Notice error={(await searchParams).error} />
      <div className="admin-grid">
        <section className="panel">
          <h2>Existing categories</h2>
          {rows.length === 0 && (
            <p className="admin-empty">No categories yet.</p>
          )}
          {rows.map((category) => (
            <article className="category-admin-row" key={category.id}>
              <form action={editCategory} className="grid gap-4">
                <Hidden name="categoryId" value={category.id} />
                <Field
                  name="name"
                  label="Category name"
                  value={category.name}
                />
                <Field
                  name="slug"
                  label="Category handle"
                  value={category.slug}
                />
                <label>
                  Parent category
                  <NativeSelect
                    name="parentId"
                    defaultValue={category.parentId ?? ""}
                  >
                    <option value="">None</option>
                    {rows
                      .filter((item) => item.id !== category.id)
                      .map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </NativeSelect>
                </label>
                <Button type="submit" variant="outline">
                  Save category
                </Button>
              </form>
              <form action={deleteCategory} className="catalog-remove-row">
                <Hidden name="categoryId" value={category.id} />
                <Field
                  name="reason"
                  label={`Reason to remove ${category.name}`}
                />
                <Button type="submit" variant="outline">
                  Remove category
                </Button>
              </form>
            </article>
          ))}
        </section>
        <section className="panel">
          <h2>Add category</h2>
          <form action={saveCategory} className="grid gap-4">
            <Field name="name" label="Category name" />
            <Field name="slug" label="Category handle" />
            <label>
              Parent category
              <NativeSelect name="parentId">
                <option value="">None</option>
                {rows.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
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
