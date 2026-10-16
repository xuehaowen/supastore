import { ProductEditorNav } from "@/app/admin/product-editor-nav";
import { CategoryPicker } from "@/app/admin/category-picker";
import Link from "next/link";
import Image from "next/image";
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
import { Button } from "@supastore/ui/button";
import { Textarea } from "@supastore/ui/textarea";
import { Checkbox } from "@supastore/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@supastore/ui/table";
import { Alert, AlertDescription } from "@supastore/ui/alert";
import { AdminDialog } from "@/app/admin/admin-dialog";
import { CatalogImageUpload } from "@/app/admin/catalog-image-upload";
import {
  setProductPublicationAction,
  bulkUpdateVariantsAction,
} from "@/app/admin/catalog-actions";
import { BulkVariantEditor } from "@/app/admin/bulk-variant-editor";
import { ProductDraftForm } from "@/app/admin/product-draft-form";

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
      groups: await tx
        .select()
        .from(categories)
        .orderBy(asc(categories.name), asc(categories.id))
        .limit(50),
      selected: await tx
        .select()
        .from(productCategories)
        .innerJoin(categories, eq(productCategories.categoryId, categories.id))
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
    <>
      <AdminNav />
      <main tabIndex={-1} id="admin-content" className="admin">
        <Link href="/admin/products" className="admin-back-link">
          ← All products
        </Link>
        <h1>Edit product</h1>
        <ProductEditorNav productId={id} />
        <Link
          href={`/admin/products/${id}/options`}
          className="admin-back-link"
        >
          Manage options & generate variants
        </Link>
        <Link
          href={`/admin/products/${id}/specifications`}
          className="admin-back-link"
        >
          Manage product specifications
        </Link>
        <Link
          href={`/admin/products/${id}/organization`}
          className="admin-back-link"
        >
          Manage collection memberships
        </Link>
        <p className="admin-description">
          {product.title} · {product.isPublished ? "Published" : "Unpublished"}
        </p>
        <Notice error={q.error} />
        {q.saved === "true" && !q.error && (
          <Alert>
            <AlertDescription>Product changes saved.</AlertDescription>
          </Alert>
        )}
        {(q.added || q.removed) && !q.error && (
          <Alert>
            <AlertDescription>
              Catalog structure updated (
              {q.added ? `${q.added} added` : `${q.removed} removed`}).
            </AlertDescription>
          </Alert>
        )}
        <ProductDraftForm
          action={editProduct}
          productId={id}
          failed={!!q.error}
          saved={q.saved === "true"}
        >
          <Hidden name="productId" value={product.id} />
          <Hidden name="quoteVersion" value={String(product.quoteVersion)} />
          <Hidden name="variantCount" value={String(variants.length)} />
          <Hidden name="imageCount" value={String(images.length)} />
          <section className="panel">
            <h2>Product details</h2>
            <Field name="title" label="Title" value={product.title} />
            <label className="check">
              <Checkbox name="taxable" defaultChecked={product.taxable} />
              Taxable merchandise
            </label>
            <label className="check">
              <Checkbox
                name="rewardEligible"
                defaultChecked={product.rewardEligible}
              />
              Eligible for purchase rewards
            </label>
            <Field name="handle" label="URL handle" value={product.handle} />
            <p className="text-sm text-muted-foreground">
              Changing the URL handle changes the public product address.
              Existing links may stop working.
            </p>
            <label>
              Description
              <Textarea name="description" defaultValue={product.description} />
            </label>
            <CategoryPicker
              name="categoryIds"
              label="Categories"
              options={groups.map((item) => ({
                id: item.id,
                label: item.name,
              }))}
              selected={selected.map((item) => ({
                id: item.categories.id,
                label: item.categories.name,
              }))}
            />
          </section>
          <section className="panel product-editor-wide">
            <h2>Variants & pricing</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Variant</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Price in minor units</TableHead>
                  <TableHead>Availability</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variants.map((variant, i) => (
                  <TableRow key={variant.id} aria-label={variant.title}>
                    <TableCell>
                      <Hidden name={`variantId-${i}`} value={variant.id} />
                      <Field
                        name={`variantTitle-${i}`}
                        label="Variant name"
                        value={variant.title}
                      />
                    </TableCell>
                    <TableCell>
                      <Field
                        name={`sku-${i}`}
                        label="SKU"
                        value={variant.sku}
                      />
                    </TableCell>
                    <TableCell>
                      <Field
                        name={`price-${i}`}
                        label="Price in minor units"
                        type="number"
                        value={variant.priceCents}
                      />
                    </TableCell>
                    <TableCell>
                      {variant.isAvailable ? "Available" : "Unavailable"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
          {images.length > 0 && (
            <section className="panel product-editor-wide">
              <h2>Product images</h2>
              {images.map((img, i) => (
                <fieldset className="grid gap-4" key={img.id}>
                  <legend>Image {i + 1}</legend>
                  <Hidden name={`imageId-${i}`} value={img.id} />
                  <Hidden name={`imageKey-${i}`} value={img.s3Key} />
                  <Image
                    src={`/api/admin/catalog-image?id=${img.id}`}
                    alt={img.altText || product.title}
                    width={160}
                    height={160}
                    unoptimized
                    className="size-40 rounded-lg object-cover"
                  />
                  <Field
                    name={`imageAlt-${i}`}
                    label="Image description"
                    value={img.altText}
                    required={false}
                  />
                  <Field
                    name={`imageSortOrder-${i}`}
                    label="Image position"
                    type="number"
                    value={img.sortOrder}
                  />
                </fieldset>
              ))}
            </section>
          )}
          <div className="product-editor-actions">
            <Link href="/admin/products">Cancel</Link>
            <Button type="submit">Save changes</Button>
          </div>
        </ProductDraftForm>
        {variants.length > 0 && (
          <BulkVariantEditor
            productId={id}
            revision={product.quoteVersion}
            variants={variants}
            action={bulkUpdateVariantsAction}
          />
        )}
        <div className="product-editor catalog-structure-editor">
          <section className="panel">
            <h2>Publishing</h2>
            <p>
              {variants.length
                ? `${variants.length} priced variants ready.`
                : "Add a priced variant before publication."}{" "}
              {images.length
                ? `${images.length} images uploaded.`
                : "Upload an image to help customers review this product."}
            </p>
            <form action={setProductPublicationAction}>
              <Hidden name="productId" value={id} />
              <Hidden name="revision" value={String(product.quoteVersion)} />
              <Hidden name="published" value={String(!product.isPublished)} />
              <Button
                type="submit"
                disabled={!product.isPublished && !variants.length}
              >
                {product.isPublished ? "Unpublish product" : "Publish product"}
              </Button>
            </form>
          </section>
          <section className="panel">
            <h2>Variant actions</h2>
            <AdminDialog trigger="Add variant" title="Add variant">
              <form action={createProductVariant} className="grid gap-4">
                <Hidden name="productId" value={product.id} />
                <Field name="title" label="Variant name" />
                <Field name="sku" label="SKU" />
                <Field
                  name="price"
                  label="Price in minor units"
                  type="number"
                />
                <div className="two-col">
                  <Field name="color" label="Color" required={false} />
                  <Field name="size" label="Size" required={false} />
                </div>
                <Button type="submit">Add variant</Button>
              </form>
            </AdminDialog>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Variant</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variants.map((variant) => (
                  <TableRow key={variant.id}>
                    <TableCell>{variant.title}</TableCell>
                    <TableCell>{variant.sku}</TableCell>
                    <TableCell>
                      <AdminDialog
                        trigger="Remove variant"
                        title={`Remove variant · ${variant.title}`}
                        description="Ordered variants are retained for history and made unavailable. Unused variants are deleted."
                      >
                        <form
                          action={deleteProductVariant}
                          className="grid gap-4"
                        >
                          <Hidden name="productId" value={product.id} />
                          <Hidden name="variantId" value={variant.id} />
                          <Field
                            name="reason"
                            label={`Reason to remove ${variant.title}`}
                          />
                          <Button type="submit">Remove variant</Button>
                        </form>
                      </AdminDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
          <section className="panel">
            <h2>Add image</h2>
            <CatalogImageUpload
              entityId={product.id}
              entityType="product"
              variants={variants}
            />
          </section>
          <section className="panel product-editor-wide">
            <h2>Remove catalog items</h2>
            <p className="admin-empty">
              Ordered variants are retained for history and made unavailable.
              Unused variants and images are deleted.
            </p>
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
    </>
  );
}
