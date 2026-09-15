import { and, eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import {
  auditRecords,
  categories,
  categoryTranslations,
  orderItems,
  productImages,
  productTranslations,
  products,
  productVariants,
  variantTranslations,
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

async function catalogTransaction<T>(
  staffUserId: string,
  work: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staffUserId, "owner");
    await tx.select().from(storeSettings).for("update");
    return work(tx);
  });
}

export async function saveCatalogTranslation(input: {
  staffUserId: string;
  entityType: "product" | "category" | "variant";
  entityId: string;
  locale: "en" | "zh";
  title: string;
  description?: string;
}) {
  const entityId = parseActionUuid(input.entityId, "Translation entity");
  const title = parseActionRequiredText(input.title, "Translated text", 200);
  return catalogTransaction(input.staffUserId, async (tx) => {
    if (input.entityType === "product") {
      const [entity] = await tx
        .select({ id: products.id })
        .from(products)
        .where(eq(products.id, entityId));
      if (!entity) throw new NotFoundError("Product not found.");
      await tx
        .insert(productTranslations)
        .values({
          productId: entityId,
          locale: input.locale,
          title,
          description: input.description ?? "",
        })
        .onConflictDoUpdate({
          target: [productTranslations.productId, productTranslations.locale],
          set: {
            title,
            description: input.description ?? "",
            updatedAt: new Date(),
          },
        });
    } else if (input.entityType === "category") {
      const [entity] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.id, entityId));
      if (!entity) throw new NotFoundError("Category not found.");
      await tx
        .insert(categoryTranslations)
        .values({ categoryId: entityId, locale: input.locale, name: title })
        .onConflictDoUpdate({
          target: [
            categoryTranslations.categoryId,
            categoryTranslations.locale,
          ],
          set: { name: title, updatedAt: new Date() },
        });
    } else {
      const [entity] = await tx
        .select({ id: productVariants.id })
        .from(productVariants)
        .where(eq(productVariants.id, entityId));
      if (!entity) throw new NotFoundError("Variant not found.");
      await tx
        .insert(variantTranslations)
        .values({ variantId: entityId, locale: input.locale, title })
        .onConflictDoUpdate({
          target: [variantTranslations.variantId, variantTranslations.locale],
          set: { title, updatedAt: new Date() },
        });
    }
    await tx.insert(auditRecords).values({
      entityType: `${input.entityType}_translation`,
      entityId,
      actorId: input.staffUserId,
      action: "translation.updated",
      details: { locale: input.locale },
    });
  });
}

export async function addProductVariant(input: {
  staffUserId: string;
  productId: string;
  title: string;
  sku: string;
  priceCents: number;
  color?: string;
  size?: string;
}) {
  const productId = parseActionUuid(input.productId, "Product");
  const title = parseActionRequiredText(input.title, "Variant title", 200);
  const sku = parseActionRequiredText(input.sku, "SKU", 200);
  const priceCents = parseActionInteger(
    input.priceCents,
    "Variant price",
    0,
    2147483647,
  );
  return catalogTransaction(input.staffUserId, async (tx) => {
    const [product] = await tx
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, productId))
      .for("update");
    if (!product) throw new NotFoundError("Product not found.");
    const [duplicate] = await tx
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(eq(productVariants.sku, sku));
    if (duplicate) throw new ConflictError("That SKU is already in use.");
    const current = await tx
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(eq(productVariants.productId, productId));
    if (current.length >= 50)
      throw new DomainError("A product cannot have more than 50 variants.");
    const [variant] = await tx
      .insert(productVariants)
      .values({
        productId,
        title,
        sku,
        priceCents,
        attributes: {
          ...(input.color ? { color: input.color } : {}),
          ...(input.size ? { size: input.size } : {}),
        },
        sortOrder: current.length,
      })
      .returning();
    await tx
      .update(products)
      .set({
        quoteVersion: sql`${products.quoteVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(products.id, productId));
    await tx.insert(auditRecords).values({
      entityType: "product_variant",
      entityId: variant!.id,
      actorId: input.staffUserId,
      action: "created",
      details: { productId, sku },
    });
    return variant!;
  });
}

export async function removeProductVariant(input: {
  staffUserId: string;
  productId: string;
  variantId: string;
  reason: string;
}) {
  const productId = parseActionUuid(input.productId, "Product");
  const variantId = parseActionUuid(input.variantId, "Variant");
  const reason = parseActionRequiredText(input.reason, "Removal reason", 500);
  return catalogTransaction(input.staffUserId, async (tx) => {
    const variants = await tx
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, productId))
      .for("update");
    const variant = variants.find((item) => item.id === variantId);
    if (!variant)
      throw new NotFoundError("Variant not found for this product.");
    if (variants.length === 1)
      throw new DomainError("A product must retain at least one variant.");
    const [referenced] = await tx
      .select({ id: orderItems.id })
      .from(orderItems)
      .where(eq(orderItems.variantId, variantId))
      .limit(1);
    const action = referenced ? "archived" : "deleted";
    if (referenced)
      await tx
        .update(productVariants)
        .set({ isAvailable: false, updatedAt: new Date() })
        .where(
          and(
            eq(productVariants.id, variantId),
            eq(productVariants.productId, productId),
          ),
        );
    else
      await tx
        .delete(productVariants)
        .where(
          and(
            eq(productVariants.id, variantId),
            eq(productVariants.productId, productId),
          ),
        );
    await tx
      .update(products)
      .set({
        quoteVersion: sql`${products.quoteVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(products.id, productId));
    await tx.insert(auditRecords).values({
      entityType: "product_variant",
      entityId: variantId,
      actorId: input.staffUserId,
      action,
      reason,
      details: { productId, sku: variant.sku },
    });
    return action;
  });
}

export async function addProductImage(input: {
  staffUserId: string;
  productId: string;
  s3Key: string;
  altText: string;
}) {
  const productId = parseActionUuid(input.productId, "Product");
  const s3Key = parseActionRequiredText(input.s3Key, "Image asset key", 2000);
  return catalogTransaction(input.staffUserId, async (tx) => {
    const [product] = await tx
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, productId));
    if (!product) throw new NotFoundError("Product not found.");
    const images = await tx
      .select({ id: productImages.id })
      .from(productImages)
      .where(eq(productImages.productId, productId));
    if (images.length >= 100)
      throw new DomainError("A product cannot have more than 100 images.");
    const [image] = await tx
      .insert(productImages)
      .values({
        productId,
        s3Key,
        altText: input.altText.trim(),
        sortOrder: images.length,
      })
      .returning();
    await tx.insert(auditRecords).values({
      entityType: "product_image",
      entityId: image!.id,
      actorId: input.staffUserId,
      action: "created",
      details: { productId, s3Key },
    });
    return image!;
  });
}

export async function removeProductImage(input: {
  staffUserId: string;
  productId: string;
  imageId: string;
  reason: string;
}) {
  const productId = parseActionUuid(input.productId, "Product");
  const imageId = parseActionUuid(input.imageId, "Image");
  const reason = parseActionRequiredText(input.reason, "Removal reason", 500);
  return catalogTransaction(input.staffUserId, async (tx) => {
    const [image] = await tx
      .delete(productImages)
      .where(
        and(
          eq(productImages.id, imageId),
          eq(productImages.productId, productId),
        ),
      )
      .returning();
    if (!image) throw new NotFoundError("Image not found for this product.");
    await tx.insert(auditRecords).values({
      entityType: "product_image",
      entityId: imageId,
      actorId: input.staffUserId,
      action: "deleted",
      reason,
      details: { productId, s3Key: image.s3Key },
    });
  });
}

export async function updateCategory(input: {
  staffUserId: string;
  categoryId: string;
  name: string;
  slug: string;
  parentId?: string;
}) {
  const categoryId = parseActionUuid(input.categoryId, "Category");
  const name = parseActionRequiredText(input.name, "Category name", 200);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug))
    throw new DomainError(
      "Use lowercase letters, numbers, and hyphens for the category handle.",
    );
  const parentId = input.parentId
    ? parseActionUuid(input.parentId, "Parent category")
    : null;
  if (parentId === categoryId)
    throw new DomainError("A category cannot be its own parent.");
  return catalogTransaction(input.staffUserId, async (tx) => {
    const [category] = await tx
      .select()
      .from(categories)
      .where(eq(categories.id, categoryId))
      .for("update");
    if (!category) throw new NotFoundError("Category not found.");
    const [duplicate] = await tx
      .select()
      .from(categories)
      .where(eq(categories.slug, input.slug));
    if (duplicate && duplicate.id !== categoryId)
      throw new ConflictError("That category handle is already in use.");
    if (parentId) {
      const [parent] = await tx
        .select()
        .from(categories)
        .where(eq(categories.id, parentId));
      if (!parent) throw new NotFoundError("Parent category not found.");
      if (parent.parentId === categoryId)
        throw new DomainError("Category relationships cannot form a cycle.");
    }
    await tx
      .update(categories)
      .set({ name, slug: input.slug, parentId, updatedAt: new Date() })
      .where(eq(categories.id, categoryId));
    await tx.insert(auditRecords).values({
      entityType: "category",
      entityId: categoryId,
      actorId: input.staffUserId,
      action: "updated",
      details: { name, slug: input.slug, parentId },
    });
  });
}

export async function removeCategory(input: {
  staffUserId: string;
  categoryId: string;
  reason: string;
}) {
  const categoryId = parseActionUuid(input.categoryId, "Category");
  const reason = parseActionRequiredText(input.reason, "Removal reason", 500);
  return catalogTransaction(input.staffUserId, async (tx) => {
    const [child] = await tx
      .select()
      .from(categories)
      .where(eq(categories.parentId, categoryId))
      .limit(1);
    if (child) throw new DomainError("Move or remove child categories first.");
    const [category] = await tx
      .delete(categories)
      .where(eq(categories.id, categoryId))
      .returning();
    if (!category) throw new NotFoundError("Category not found.");
    await tx.insert(auditRecords).values({
      entityType: "category",
      entityId: categoryId,
      actorId: input.staffUserId,
      action: "deleted",
      reason,
      details: { name: category.name, slug: category.slug },
    });
  });
}
