import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  products,
  productVariants,
  productCategories,
  productImages,
  categories,
} from "@/infrastructure/db/schema";
import { staffIdentity } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { Field, Hidden, Notice } from "@/app/components";
import { AdminNav } from "@/app/admin/admin-nav";
import {
  createProductImage,
  createProductVariant,
  deleteProductImage,
  deleteProductVariant,
  editProduct,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    saved?: string;
    added?: string;
    removed?: string;
  }>;
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
      images: await tx
        .select()
        .from(productImages)
        .where(eq(productImages.productId, id))
        .orderBy(asc(productImages.sortOrder)),
    };
  });
  if (!data) notFound();
  const q = await searchParams;
  const { product, variants, groups, selected, images } = data;
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
      {(q.added || q.removed) && !q.error && (
        <p role="status" className="admin-save-notice">
          Catalog structure updated (
          {q.added ? `${q.added} added` : `${q.removed} removed`}).
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
      <div className="product-editor catalog-structure-editor">
        <section className="panel">
          <h2>Add variant</h2>
          <form action={createProductVariant} className="grid gap-4">
            <Hidden name="productId" value={product.id} />
            <Field name="title" label="Variant name" />
            <Field name="sku" label="SKU" />
            <Field name="price" label="Price in minor units" type="number" />
            <div className="two-col">
              <Field name="color" label="Color" required={false} />
              <Field name="size" label="Size" required={false} />
            </div>
            <Button type="submit">Add variant</Button>
          </form>
        </section>
        <section className="panel">
          <h2>Add image</h2>
          <form action={createProductImage} className="grid gap-4">
            <Hidden name="productId" value={product.id} />
            <Field name="s3Key" label="Image asset key" />
            <Field name="altText" label="Image description" required={false} />
            <Button type="submit">Add image</Button>
          </form>
        </section>
        <section className="panel product-editor-wide">
          <h2>Remove catalog items</h2>
          <p className="admin-empty">
            Ordered variants are retained for history and made unavailable.
            Unused variants and images are deleted.
          </p>
          {variants.map((variant) => (
            <form
              action={deleteProductVariant}
              className="catalog-remove-row"
              key={variant.id}
            >
              <Hidden name="productId" value={product.id} />
              <Hidden name="variantId" value={variant.id} />
              <span>
                <strong>{variant.title}</strong>
                <small>
                  {variant.sku} ·{" "}
                  {variant.isAvailable ? "Available" : "Unavailable"}
                </small>
              </span>
              <Field
                name="reason"
                label={`Reason to remove ${variant.title}`}
              />
              <Button type="submit" variant="outline">
                Remove variant
              </Button>
            </form>
          ))}
          {images.map((image) => (
            <form
              action={deleteProductImage}
              className="catalog-remove-row"
              key={image.id}
            >
              <Hidden name="productId" value={product.id} />
              <Hidden name="imageId" value={image.id} />
              <span>
                <strong>{image.altText || "Product image"}</strong>
                <small>{image.s3Key}</small>
              </span>
              <Field
                name="reason"
                label={`Reason to remove image ${image.altText || image.s3Key}`}
              />
              <Button type="submit" variant="outline">
                Remove image
              </Button>
            </form>
          ))}
        </section>
      </div>
    </main>
  );
}
