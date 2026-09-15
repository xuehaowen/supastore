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
import { saveProduct, toggleAvailability } from "@/app/actions";
import { Field, Hidden, Notice } from "@/app/components";
import { AdminNav } from "@/app/admin/admin-nav";
import { CatalogTabs } from "@/app/admin/catalog-tabs";
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
  const productRows = [
    ...new Map(rows.map((row) => [row.products.id, row.products])).values(),
  ];
  return (
    <main className="admin">
      <AdminNav />
      <p className="eyebrow">CATALOG MANAGEMENT</p>
      <h1>Products</h1>
      <p className="admin-description">
        Manage your catalog, pricing, and product availability.
      </p>
      <CatalogTabs />
      <Notice error={(await searchParams).error} />
      <div className="admin-grid">
        <section>
          <h2>Products & availability</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Variants</TableHead>
                <TableHead>Price range</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productRows.map((product) => {
                const variants = rows
                  .filter((row) => row.products.id === product.id)
                  .map((row) => row.product_variants);
                const prices = variants.map((variant) => variant.priceCents);
                return (
                  <TableRow key={product.id}>
                    <TableCell>
                      <strong>{product.title}</strong>
                      <small className="table-secondary">
                        /{product.handle}
                      </small>
                    </TableCell>
                    <TableCell>{variants.length}</TableCell>
                    <TableCell>
                      {money(Math.min(...prices))}
                      {prices.length > 1 && ` – ${money(Math.max(...prices))}`}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`status-badge ${product.isPublished ? "status-active" : "status-muted"}`}
                      >
                        {product.isPublished ? "Published" : "Draft"}
                      </span>
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
            </TableBody>
          </Table>
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
        </section>
      </div>
    </main>
  );
}
