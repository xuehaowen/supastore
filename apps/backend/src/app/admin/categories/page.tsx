import { asc, sql, ilike, or, inArray } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/infrastructure/db";
import { categories } from "@/infrastructure/db/schema";
import { staffIdentity } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { Field, Hidden, Notice } from "@/app/components";
import { AdminNav } from "@/app/admin/admin-nav";
import { CatalogTabs } from "@/app/admin/catalog-tabs";
import { AdminDialog } from "@/app/admin/admin-dialog";
import { deleteCategory, editCategory, saveCategory } from "@/app/actions";
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

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    q?: string;
    page?: string;
    parentQ?: string;
  }>;
}) {
  const staff = await staffIdentity().catch(() => redirect("/admin/login"));
  const query = await searchParams;
  const search = query.q?.trim().slice(0, 120) ?? "";
  const parentSearch = query.parentQ?.trim().slice(0, 120) ?? "";
  const page = Math.max(
    1,
    Math.min(100000, Number.parseInt(query.page || "1", 10) || 1),
  );
  const hierarchy = sql<string>`(with recursive ancestors as (
    select c.id,c.parent_id,c.name,0 as depth,array[c.id] as visited from categories c where c.id=${sql`${categories.id}`}
    union all select c.id,c.parent_id,c.name,a.depth+1,a.visited||c.id from categories c join ancestors a on c.id=a.parent_id where not c.id=any(a.visited) and a.depth<100
  ) select string_agg(name,' / ' order by depth desc) from ancestors)`;
  const literal = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const filter = search
    ? or(ilike(hierarchy, literal), ilike(categories.slug, literal))
    : undefined;
  const { rows, groups, total } = await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staff, "owner");
    const rows = await tx
      .select({
        category: categories,
        hierarchy,
        productCount: sql<number>`(select count(*)::int from product_categories pc where pc.category_id=${sql`${categories.id}`})`,
      })
      .from(categories)
      .where(filter)
      .orderBy(
        asc(categories.sortOrder),
        asc(categories.name),
        asc(categories.id),
      )
      .limit(25)
      .offset((page - 1) * 25);
    const [count] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(categories)
      .where(filter);
    const parentLiteral = `%${parentSearch.replace(/[\\%_]/g, "\\$&")}%`;
    const candidates = await tx
      .select()
      .from(categories)
      .where(
        parentSearch
          ? or(
              ilike(categories.name, parentLiteral),
              ilike(categories.slug, parentLiteral),
            )
          : undefined,
      )
      .orderBy(asc(categories.name), asc(categories.id))
      .limit(200);
    const parents = rows
      .map((row) => row.category.parentId)
      .filter((id): id is string => !!id);
    const selectedParents = parents.length
      ? await tx
          .select()
          .from(categories)
          .where(inArray(categories.id, parents))
      : [];
    const groups = [
      ...new Map(
        [
          ...candidates,
          ...selectedParents,
          ...rows.map((row) => row.category),
        ].map((category) => [category.id, category]),
      ).values(),
    ];
    return { rows, groups, total: count?.total || 0 };
  });
  const path = (id: string) =>
    rows.find((row) => row.category.id === id)?.hierarchy ||
    groups.find((category) => category.id === id)?.name ||
    "";
  const visible = rows;
  return (
    <main className="admin">
      <AdminNav />
      <p className="eyebrow">CATALOG STRUCTURE</p>
      <h1>Categories</h1>
      <p className="admin-description">
        Organize products and maintain category handles and hierarchy.
      </p>
      <div className="admin-page-actions">
        <AdminDialog
          trigger="Add category"
          title="Add category"
          description="Create a catalog category and optionally place it under a parent."
        >
          <form action={saveCategory} className="grid gap-4">
            <Field name="name" label="Category name" />
            <Field name="slug" label="Category handle" />
            <label>
              Parent category
              <NativeSelect name="parentId">
                <option value="">None</option>
                {groups.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <Button type="submit">Add category</Button>
          </form>
        </AdminDialog>
      </div>
      <CatalogTabs />
      <Notice error={query.error} />
      <form method="get" className="admin-filter-bar">
        <Hidden name="parentQ" value={parentSearch} />
        <Field
          label="Search categories"
          name="q"
          value={search}
          required={false}
        />
        <Button type="submit">Search</Button>
      </form>
      <form method="get" className="admin-filter-bar">
        <Hidden name="q" value={search} />
        <Hidden name="page" value={String(page)} />
        <Field
          label="Find parent categories"
          name="parentQ"
          value={parentSearch}
          required={false}
        />
        <Button type="submit">Search parent choices</Button>
        <p className="text-sm text-muted-foreground">
          Parent menus show up to 200 matches plus the current selections.
        </p>
      </form>
      <div className="admin-grid">
        <section className="panel">
          <h2>Existing categories</h2>
          <p className="admin-description">
            {total
              ? `${(page - 1) * 25 + (rows.length ? 1 : 0)}–${(page - 1) * 25 + rows.length} of ${total}`
              : "0 categories"}
          </p>
          {visible.length === 0 && (
            <p className="admin-empty">No categories yet.</p>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Handle</TableHead>
                <TableHead>Products</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map(({ category, productCount }) => (
                <TableRow key={category.id}>
                  <TableCell>
                    <strong>{category.name}</strong>
                    <small className="block text-muted-foreground">
                      {path(category.id)}
                    </small>
                  </TableCell>
                  <TableCell>/{category.slug}</TableCell>
                  <TableCell>{productCount}</TableCell>
                  <TableCell>
                    <div className="table-actions">
                      <AdminDialog
                        trigger="Edit category"
                        title={`Edit category · ${category.name}`}
                      >
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
                              {groups
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
                      </AdminDialog>
                      <AdminDialog
                        trigger="Remove"
                        title={`Remove category · ${category.name}`}
                        description={`This removes the category and its ${productCount} product associations. Products are retained. Move child categories before removing their parent.`}
                      >
                        <form action={deleteCategory} className="grid gap-4">
                          <Hidden name="categoryId" value={category.id} />
                          <Field
                            name="reason"
                            label={`Reason to remove ${category.name}`}
                          />
                          <Button type="submit" variant="outline">
                            Remove category
                          </Button>
                        </form>
                      </AdminDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <nav className="admin-pagination" aria-label="Category pages">
            {page > 1 && (
              <Link
                href={`/admin/categories?q=${encodeURIComponent(search)}&parentQ=${encodeURIComponent(parentSearch)}&page=${page - 1}`}
              >
                ← Previous
              </Link>
            )}
            {page * 25 < total && (
              <Link
                href={`/admin/categories?q=${encodeURIComponent(search)}&parentQ=${encodeURIComponent(parentSearch)}&page=${page + 1}`}
              >
                Next →
              </Link>
            )}
          </nav>
        </section>
      </div>
    </main>
  );
}
