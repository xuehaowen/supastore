import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  products,
  productVariants,
  productCategories,
  productTranslations,
  productImages,
  categories,
} from "@/infrastructure/db/schema";
import { staffIdentity } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { AdminNav, Field, Hidden, Notice } from "@/app/components";
import { editProduct } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const staff = await staffIdentity().catch(() => redirect("/admin/login"));
  const { id } = await params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    notFound();
  const data = await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staff, "owner");
    const [product] = await tx
      .select()
      .from(products)
      .where(eq(products.id, id));
    if (!product) return null;
    return {
      product,
      variants: await tx
        .select()
        .from(productVariants)
        .where(eq(productVariants.productId, id))
        .orderBy(asc(productVariants.sortOrder)),
      groups: await tx.select().from(categories).orderBy(asc(categories.name)),
      selected: await tx
        .select()
        .from(productCategories)
        .where(eq(productCategories.productId, id)),
      translations: await tx
        .select()
        .from(productTranslations)
        .where(eq(productTranslations.productId, id)),
      images: await tx
        .select()
        .from(productImages)
        .where(eq(productImages.productId, id))
        .orderBy(asc(productImages.sortOrder)),
    };
  });
  if (!data) notFound();
  const q = await searchParams;
  const { product, variants, groups, selected, translations, images } = data;
  const zh = translations.find((t) => t.locale === "zh");
  return (
    <main className="admin">
      <AdminNav />
      <Link href="/admin/products" className="admin-back-link">
        ← All products
      </Link>
      <h1>Edit product</h1>
      <p className="admin-description">
        {product.title} · {product.isPublished ? "Published" : "Unpublished"}
      </p>
      <Notice error={q.error} />
      {q.saved === "true" && !q.error && (
        <p role="status" className="admin-save-notice">
          Product changes saved.
        </p>
      )}
      <form action={editProduct} className="product-editor">
        <Hidden name="productId" value={product.id} />
        <Hidden name="quoteVersion" value={String(product.quoteVersion)} />
        <Hidden name="variantCount" value={String(variants.length)} />
        <Hidden name="imageCount" value={String(images.length)} />
        <section className="panel">
          <h2>Product details</h2>
          <Field name="title" label="Title" value={product.title} />
          <Field name="handle" label="URL handle" value={product.handle} />
          <label>
            Description
            <Textarea name="description" defaultValue={product.description} />
          </label>
          <fieldset className="grid gap-3">
            <legend className="mb-3">Categories</legend>
            {groups.map((g) => (
              <label className="check" key={g.id}>
                <Checkbox
                  name="categoryIds"
                  value={g.id}
                  defaultChecked={selected.some(
                    (item) => item.categoryId === g.id,
                  )}
                />
                {g.name}
              </label>
            ))}
            {groups.length === 0 && (
              <p className="admin-empty">
                Create categories from the Products page.
              </p>
            )}
          </fieldset>
        </section>
        <section className="panel" id="translations">
          <h2>Chinese translation</h2>
          <Field
            name="zhTitle"
            label="Chinese title"
            value={zh?.title}
            required={false}
          />
          <label>
            Chinese description
            <Textarea
              name="zhDescription"
              defaultValue={zh?.description ?? ""}
            />
          </label>
          <p className="text-sm text-muted-foreground">
            Leave both fields empty to use the default product text.
          </p>
        </section>
        <section className="panel product-editor-wide">
          <h2>Variants & pricing</h2>
          {variants.map((variant, i) => (
            <fieldset className="variant-editor" key={variant.id}>
              <legend>{variant.title}</legend>
              <Hidden name={`variantId-${i}`} value={variant.id} />
              <Field
                name={`variantTitle-${i}`}
                label="Variant name"
                value={variant.title}
              />
              <Field name={`sku-${i}`} label="SKU" value={variant.sku} />
              <Field
                name={`price-${i}`}
                label="Price in minor units"
                type="number"
                value={variant.priceCents}
              />
            </fieldset>
          ))}
        </section>
        {images.length > 0 && (
          <section className="panel product-editor-wide">
            <h2>Product images</h2>
            {images.map((img, i) => (
              <fieldset className="grid gap-4" key={img.id}>
                <legend>Image {i + 1}</legend>
                <Hidden name={`imageId-${i}`} value={img.id} />
                <Field
                  name={`imageKey-${i}`}
                  label="Image asset key"
                  value={img.s3Key}
                />
                <Field
                  name={`imageAlt-${i}`}
                  label="Image description"
                  value={img.altText}
                  required={false}
                />
              </fieldset>
            ))}
          </section>
        )}
        <div className="product-editor-actions">
          <Link href="/admin/products">Cancel</Link>
          <Button type="submit">Save changes</Button>
        </div>
      </form>
    </main>
  );
}
