import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import {
  products,
  productVariants,
  productCategories,
  productTranslations,
  productImages,
  categories,
  storeSettings,
} from "@/infrastructure/db/schema";
import {
  ConflictError,
  DomainError,
  NotFoundError,
} from "@/application/common/errors";
import {
  parseActionInteger,
  parseActionRequiredText,
  parseActionUuid,
} from "@/application/common/request-validation";

export interface UpdateProductInput {
  staffUserId: string;
  productId: string;
  quoteVersion: number;
  title: string;
  handle: string;
  description: string;
  categoryIds: string[];
  variants: { id: string; title: string; sku: string; priceCents: number }[];
  images: { id: string; s3Key: string; altText: string }[];
}

export async function updateProduct(input: UpdateProductInput) {
  parseActionUuid(input.productId, "Product");
  parseActionInteger(input.quoteVersion, "Product version", 1, 2147483647);
  const title = parseActionRequiredText(input.title, "Product title", 200);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.handle))
    throw new DomainError(
      "Use lowercase letters, numbers, and hyphens for the URL handle.",
    );
  if (!input.variants.length || input.variants.length > 50)
    throw new DomainError("A product must have between 1 and 50 variants.");
  for (const variant of input.variants) {
    parseActionUuid(variant.id, "Variant");
    parseActionRequiredText(variant.title, "Variant title", 200);
    parseActionRequiredText(variant.sku, "SKU", 200);
    parseActionInteger(variant.priceCents, "Variant price", 0, 2147483647);
  }
  if (
    new Set(input.variants.map((v) => v.id)).size !== input.variants.length ||
    new Set(input.variants.map((v) => v.sku)).size !== input.variants.length
  )
    throw new DomainError("Each variant and SKU must be unique.");
  const categoryIds = [
    ...new Set(input.categoryIds.map((id) => parseActionUuid(id, "Category"))),
  ];
  for (const image of input.images) {
    parseActionUuid(image.id, "Image");
    parseActionRequiredText(image.s3Key, "Image asset key", 2000);
  }
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.staffUserId, "owner");
    const [settings] = await tx.select().from(storeSettings).for("update");
    const [product] = await tx
      .select()
      .from(products)
      .where(eq(products.id, input.productId))
      .for("update");
    if (!product) throw new NotFoundError("Product not found.");
    if (product.quoteVersion !== input.quoteVersion)
      throw new ConflictError(
        "This product changed since you opened it. Reload the editor before saving.",
      );
    const [duplicate] = await tx
      .select()
      .from(products)
      .where(eq(products.handle, input.handle));
    if (duplicate && duplicate.id !== product.id)
      throw new ConflictError("That URL handle is already in use.");
    const variants = await tx
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, product.id));
    if (
      variants.length !== input.variants.length ||
      input.variants.some(
        (v) => !variants.some((existing) => existing.id === v.id),
      )
    )
      throw new DomainError("The variant list has changed. Reload the editor.");
    const matchingSkus = await tx
      .select()
      .from(productVariants)
      .where(
        inArray(
          productVariants.sku,
          input.variants.map((v) => v.sku),
        ),
      );
    if (
      matchingSkus.some(
        (existing) =>
          !input.variants.some(
            (v) => v.id === existing.id && v.sku === existing.sku,
          ),
      )
    )
      throw new ConflictError(
        "A SKU is already in use. Choose a unique SKU for each variant.",
      );
    if (categoryIds.length) {
      const found = await tx
        .select()
        .from(categories)
        .where(inArray(categories.id, categoryIds));
      if (found.length !== categoryIds.length)
        throw new DomainError("A selected category no longer exists.");
    }
    const images = await tx
      .select()
      .from(productImages)
      .where(eq(productImages.productId, product.id));
    if (
      new Set(input.images.map((i) => i.id)).size !== input.images.length ||
      input.images.length !== images.length ||
      input.images.some((i) => !images.some((existing) => existing.id === i.id))
    )
      throw new DomainError("The image list has changed. Reload the editor.");
    await tx
      .update(products)
      .set({
        title,
        handle: input.handle,
        description: input.description,
        quoteVersion: sql`${products.quoteVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(products.id, product.id));
    for (const variant of input.variants) {
      await tx
        .update(productVariants)
        .set({
          title: variant.title,
          sku: variant.sku,
          priceCents: variant.priceCents,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(productVariants.id, variant.id),
            eq(productVariants.productId, product.id),
          ),
        );
    }
    await tx
      .delete(productCategories)
      .where(eq(productCategories.productId, product.id));
    if (categoryIds.length)
      await tx.insert(productCategories).values(
        categoryIds.map((categoryId) => ({
          productId: product.id,
          categoryId,
        })),
      );
    await tx
      .update(productTranslations)
      .set({ title, description: input.description, updatedAt: new Date() })
      .where(
        and(
          eq(productTranslations.productId, product.id),
          eq(productTranslations.locale, settings?.defaultLocale ?? "en"),
        ),
      );
    for (const image of input.images)
      await tx
        .update(productImages)
        .set({ s3Key: image.s3Key, altText: image.altText })
        .where(
          and(
            eq(productImages.id, image.id),
            eq(productImages.productId, product.id),
          ),
        );
    return product.id;
  });
}
