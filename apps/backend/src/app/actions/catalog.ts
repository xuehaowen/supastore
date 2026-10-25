"use server";
import { DomainError } from "@/application/common/errors";
import {
  parseActionBoolean,
  parseActionEnum,
  parseActionInteger,
  parseActionRequiredText,
  parseActionUuid,
} from "@/application/common/request-validation";
import { createCategory } from "@/application/use-cases/catalog/create-category";
import { createProduct } from "@/application/use-cases/catalog/create-product";
import {
  addProductVariant,
  removeCategory,
  removeProductImage,
  removeProductVariant,
  saveCatalogTranslation as saveCatalogTranslationUseCase,
  updateCategory,
} from "@/application/use-cases/catalog/manage-catalog";
import { updateProduct } from "@/application/use-cases/catalog/update-product";
import { updateProductAvailability } from "@/application/use-cases/catalog/update-product-availability";
import {
  savePromotion,
  setPromotionActive,
} from "@/application/use-cases/promotions/manage-promotions";
import { staffIdentity } from "@/infrastructure/web";
import { revalidatePath, revalidateTag } from "next/cache";
import { field, perform } from "./common";
export async function saveProduct(form: FormData) {
  return perform("/admin/products", async () => {
    await createProduct({
      staffUserId: await staffIdentity(),
      handle: field(form, "handle"),
      title: field(form, "title"),
      description: field(form, "description"),
      categoryIds: form.getAll("categoryIds").map(String),
      variants: Array.from(
        {
          length: parseActionInteger(
            field(form, "variantCount"),
            "Variant count",
            1,
            50,
          ),
        },
        (_, i) => ({
          sku: field(form, "sku-" + i),
          title: field(form, "variantTitle-" + i),
          priceCents: parseActionInteger(
            field(form, "price-" + i),
            "Variant price",
            0,
            2_147_483_647,
          ),
          attributes: {
            color: field(form, "color-" + i),
            size: field(form, "size-" + i),
          },
        }),
      ),
      translations: [],
      images: field(form, "imageKey")
        ? [{ s3Key: field(form, "imageKey"), altText: field(form, "title") }]
        : [],
    });
    revalidateTag("catalog");
    revalidatePath("/[locale]", "layout");
  });
}
export async function editProduct(form: FormData) {
  const rawId = field(form, "productId");
  const path = /^[0-9a-f-]{36}$/i.test(rawId)
    ? `/admin/products/${rawId}/edit`
    : "/admin/products";
  return perform(path, async () => {
    const productId = await updateProduct({
      staffUserId: await staffIdentity(),
      productId: parseActionUuid(rawId, "Product"),
      quoteVersion: parseActionInteger(
        field(form, "quoteVersion"),
        "Product version",
        1,
        2147483647,
      ),
      taxable: form.has("taxable"),
      rewardEligible: form.has("rewardEligible"),
      title: field(form, "title"),
      handle: field(form, "handle"),
      description: field(form, "description"),
      categoryIds: form.getAll("categoryIds").map(String),
      variants: Array.from(
        {
          length: parseActionInteger(
            field(form, "variantCount"),
            "Variant count",
            1,
            50,
          ),
        },
        (_, i) => ({
          id: parseActionUuid(field(form, `variantId-${i}`), "Variant"),
          title: field(form, `variantTitle-${i}`),
          sku: field(form, `sku-${i}`),
          priceCents: parseActionInteger(
            field(form, `price-${i}`),
            "Variant price",
            0,
            2147483647,
          ),
        }),
      ),
      images: Array.from(
        {
          length: parseActionInteger(
            field(form, "imageCount"),
            "Image count",
            0,
            100,
          ),
        },
        (_, i) => ({
          id: parseActionUuid(field(form, `imageId-${i}`), "Image"),
          s3Key: field(form, `imageKey-${i}`),
          altText: field(form, `imageAlt-${i}`),
          ...(field(form, `imageSortOrder-${i}`)
            ? {
                sortOrder: parseActionInteger(
                  field(form, `imageSortOrder-${i}`),
                  "Image position",
                  0,
                  1000000,
                ),
              }
            : {}),
        }),
      ),
    });
    revalidateTag("catalog");
    revalidatePath("/[locale]", "layout");
    revalidatePath("/admin/products", "layout");
    revalidatePath("/admin/translations");
    return `/admin/products/${productId}/edit?saved=true`;
  });
}
export async function createProductVariant(form: FormData) {
  const productId = parseActionUuid(field(form, "productId"), "Product");
  return perform(`/admin/products/${productId}/edit`, async () => {
    await addProductVariant({
      staffUserId: await staffIdentity(),
      productId,
      title: field(form, "title"),
      sku: field(form, "sku"),
      priceCents: parseActionInteger(
        field(form, "price"),
        "Variant price",
        0,
        2147483647,
      ),
      color: field(form, "color"),
      size: field(form, "size"),
    });
    revalidateTag("catalog");
    revalidatePath("/[locale]", "layout");
    return `/admin/products/${productId}/edit?added=variant`;
  });
}
export async function deleteProductVariant(form: FormData) {
  const productId = parseActionUuid(field(form, "productId"), "Product");
  return perform(`/admin/products/${productId}/edit`, async () => {
    const result = await removeProductVariant({
      staffUserId: await staffIdentity(),
      productId,
      variantId: parseActionUuid(field(form, "variantId"), "Variant"),
      reason: field(form, "reason"),
    });
    revalidateTag("catalog");
    revalidatePath("/[locale]", "layout");
    return `/admin/products/${productId}/edit?removed=${result}`;
  });
}
export async function deleteProductImage(form: FormData) {
  const productId = parseActionUuid(field(form, "productId"), "Product");
  return perform(`/admin/products/${productId}/edit`, async () => {
    await removeProductImage({
      staffUserId: await staffIdentity(),
      productId,
      imageId: parseActionUuid(field(form, "imageId"), "Image"),
      reason: field(form, "reason"),
    });
    revalidateTag("catalog");
    revalidatePath("/[locale]", "layout");
    return `/admin/products/${productId}/edit?removed=image`;
  });
}
export async function editCategory(form: FormData) {
  return perform("/admin/categories", async () => {
    const parentId = field(form, "parentId");
    await updateCategory({
      staffUserId: await staffIdentity(),
      categoryId: parseActionUuid(field(form, "categoryId"), "Category"),
      name: field(form, "name"),
      slug: field(form, "slug"),
      ...(parentId ? { parentId } : {}),
    });
    revalidateTag("catalog");
    revalidatePath("/[locale]", "layout");
  });
}
export async function deleteCategory(form: FormData) {
  return perform("/admin/categories", async () => {
    await removeCategory({
      staffUserId: await staffIdentity(),
      categoryId: parseActionUuid(field(form, "categoryId"), "Category"),
      reason: field(form, "reason"),
    });
    revalidateTag("catalog");
    revalidatePath("/[locale]", "layout");
  });
}
export async function saveCatalogTranslation(form: FormData) {
  return perform("/admin/translations", async () => {
    const staff = await staffIdentity();
    const entityType = parseActionEnum(
      field(form, "entityType"),
      "Translation entity",
      ["product", "category", "variant"] as const,
    );
    const entityId = parseActionUuid(
      field(form, "entityId"),
      "Translation entity",
    );
    const locale = parseActionEnum(field(form, "translationLocale"), "Locale", [
      "en",
      "zh",
    ] as const);
    const title = parseActionRequiredText(
      field(form, "title"),
      "Translated text",
      200,
    );
    const description = field(form, "description");
    await saveCatalogTranslationUseCase({
      staffUserId: staff,
      entityType,
      entityId,
      locale,
      title,
      ...(description ? { description } : {}),
    });
    revalidateTag("catalog");
    revalidatePath("/[locale]", "layout");
    return `/admin/translations?locale=${locale}`;
  });
}
export async function upsertPromotion(form: FormData) {
  return perform("/admin/promotions", async () => {
    const startsAt = field(form, "startsAt");
    const endsAt = field(form, "endsAt");
    const parseDate = (value: string, label: string) => {
      if (!value) return undefined;
      const date = new Date(value);
      if (Number.isNaN(date.getTime()))
        throw new DomainError(`${label} is invalid.`);
      return date;
    };
    const usageLimit = field(form, "usageLimit");
    const id = field(form, "id");
    await savePromotion({
      staffUserId: await staffIdentity(),
      ...(id ? { id: parseActionUuid(id, "Promotion") } : {}),
      code: field(form, "code"),
      name: field(form, "name"),
      discountType: parseActionEnum(
        field(form, "discountType"),
        "Discount type",
        ["percentage", "fixed"] as const,
      ),
      discountValue: parseActionInteger(
        field(form, "discountValue"),
        "Discount value",
        1,
        2147483647,
      ),
      minimumSubtotalCents: parseActionInteger(
        field(form, "minimumSubtotal"),
        "Minimum subtotal",
        0,
        2147483647,
      ),
      ...(field(form, "maximumOriginalSubtotal")
        ? {
            maximumOriginalSubtotalCents: parseActionInteger(
              field(form, "maximumOriginalSubtotal"),
              "Maximum qualifying value",
              1,
              2147483647,
            ),
          }
        : {}),
      ...(field(form, "maximumQuantity")
        ? {
            maximumQuantity: parseActionInteger(
              field(form, "maximumQuantity"),
              "Maximum quantity",
              1,
              99900,
            ),
          }
        : {}),
      ...(usageLimit
        ? {
            usageLimit: parseActionInteger(
              usageLimit,
              "Usage limit",
              1,
              2147483647,
            ),
          }
        : {}),
      isActive: form.has("active"),
      ...(startsAt ? { startsAt: parseDate(startsAt, "Start date")! } : {}),
      ...(endsAt ? { endsAt: parseDate(endsAt, "End date")! } : {}),
    });
  });
}
export async function togglePromotion(form: FormData) {
  return perform("/admin/promotions", async () => {
    await setPromotionActive({
      staffUserId: await staffIdentity(),
      id: parseActionUuid(field(form, "promotionId"), "Promotion"),
      isActive: parseActionBoolean(field(form, "active"), "Active"),
    });
  });
}
export async function toggleAvailability(form: FormData) {
  return perform("/admin/products", async () => {
    await updateProductAvailability({
      staffUserId: await staffIdentity(),
      ...(field(form, "productId")
        ? {
            productId: parseActionUuid(field(form, "productId"), "Product"),
            isPublished: parseActionBoolean(
              field(form, "published"),
              "Published",
            ),
          }
        : {
            variantId: parseActionUuid(field(form, "variantId"), "Variant"),
            isAvailable: parseActionBoolean(
              field(form, "available"),
              "Available",
            ),
          }),
    });
    revalidateTag("catalog");
    revalidatePath("/[locale]", "layout");
  });
}
export async function saveCategory(form: FormData) {
  return perform("/admin/categories", async () => {
    await createCategory({
      staffUserId: await staffIdentity(),
      name: field(form, "name"),
      slug: field(form, "slug"),
      parentId: field(form, "parentId"),
    });
    revalidateTag("catalog");
    revalidatePath("/[locale]", "layout");
  });
}
