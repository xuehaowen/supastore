import { VariantFields } from "@/app/interactive";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listAdminProducts } from "@/application/use-cases/catalog/list-admin-products";
import { staffIdentity, money } from "@/infrastructure/web";
import { saveProduct, toggleAvailability } from "@/app/actions";
import { Field, Hidden, Notice } from "@/app/components";
import { AdminNav } from "@/app/admin/admin-nav";
import { CatalogTabs } from "@/app/admin/catalog-tabs";
import { AdminDialog } from "@/app/admin/admin-dialog";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
export default async function Products({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    q?: string;
    status?: string;
    category?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  const staff = await staffIdentity().catch(() => redirect("/admin/login"));
  const query = await searchParams;
  const { rows, groups, store, total, page, search, status, category, sort } =
    await listAdminProducts(staff, query);
  const pageUrl = (target: number) =>
    `/admin/products?${new URLSearchParams({ q: search, status, category, sort, page: String(target) })}`;
  return (
    <main className="admin">
      <AdminNav />
      <p className="eyebrow">CATALOG MANAGEMENT</p>
      <h1>Products</h1>
      <p className="admin-description">
        Manage your catalog, pricing, and product availability.
      </p>
      <div className="admin-page-actions">
        <Link href="/admin/products/new">Create draft product</Link>
        <Link href="/admin/products/mapping">Review legacy option mappings</Link>
        <AdminDialog
          trigger="Add product"
          title="Add product"
          description="Create the product and its first sellable variants."
        >
          <form action={saveProduct} className="grid gap-4">
            <Field name="title" label="Title" />
            <Field name="handle" label="URL handle" />
            <label>
              Description
              <Textarea name="description" />
            </label>
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
        </AdminDialog>
      </div>
      <CatalogTabs />
      <Notice error={query.error} />
      <form method="get" className="admin-filter-bar catalog-filter-bar">
        <Field
          name="q"
          label="Search products"
          value={search}
          required={false}
        />
        <label>
          Status
          <NativeSelect name="status" defaultValue={status}>
            <option value="">All statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </NativeSelect>
        </label>
        <label>
          Category
          <NativeSelect name="category" defaultValue={category}>
            <option value="">All categories</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label>
          Sort
          <NativeSelect name="sort" defaultValue={sort}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="title">Title A–Z</option>
          </NativeSelect>
        </label>
        <Button type="submit">Filter</Button>
      </form>
      <div>
        <section className="panel">
          <h2>Products & availability · {total}</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Handle</TableHead>
                <TableHead>Variants</TableHead>
                <TableHead>Price range</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ product, variantCount, minPrice, maxPrice }) => {
                return (
                  <TableRow key={product.id}>
                    <TableCell>
                      <strong>{product.title}</strong>
                    </TableCell>
                    <TableCell>/{product.handle}</TableCell>
                    <TableCell>{variantCount}</TableCell>
                    <TableCell>
                      {minPrice === null
                        ? "Not priced"
                        : money(minPrice, store?.currency, store?.precision)}
                      {minPrice !== null &&
                        maxPrice !== null &&
                        maxPrice > minPrice &&
                        ` – ${money(maxPrice, store?.currency, store?.precision)}`}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={product.isPublished ? "default" : "secondary"}
                      >
                        {product.isPublished ? "Published" : "Draft"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="table-actions">
                        <Link
                          href={`/admin/products/${product.id}/edit`}
                          className="admin-edit-link"
                        >
                          Edit
                        </Link>
                        <form action={toggleAvailability}>
                          <Hidden name="productId" value={product.id} />
                          <Hidden
                            name="published"
                            value={String(!product.isPublished)}
                          />
                          <Button type="submit" size="sm" variant="outline">
                            {product.isPublished ? "Unpublish" : "Publish"}
                          </Button>
                        </form>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    No products match these filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <nav className="admin-pagination" aria-label="Product pages">
            {page > 1 ? (
              <Link href={pageUrl(page - 1)}>Previous</Link>
            ) : (
              <span />
            )}
            <span>
              Page {page} of {Math.max(1, Math.ceil(total / 25))}
            </span>
            {page * 25 < total ? (
              <Link href={pageUrl(page + 1)}>Next</Link>
            ) : (
              <span />
            )}
          </nav>
        </section>
      </div>
    </main>
  );
}
