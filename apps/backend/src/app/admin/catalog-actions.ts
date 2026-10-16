"use server";
import { actionError } from "@/infrastructure/http/failure";
import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { staffIdentity } from "@/infrastructure/web";
import {
  saveCollection,
  changeCollectionMember,
  saveCollectionTranslation,
} from "@/application/use-cases/catalog/manage-collections";
import { DomainError } from "@/application/common/errors";
import { parseActionInteger } from "@/application/common/request-validation";
import {
  saveAttribute,
  saveAttributeTranslation,
} from "@/application/use-cases/catalog/manage-attributes";
import { generateProductVariants } from "@/application/use-cases/catalog/generate-variants";
import { createProduct } from "@/application/use-cases/catalog/create-product";
import { changeSpecification } from "@/application/use-cases/catalog/manage-specifications";
import { updateProductAvailability } from "@/application/use-cases/catalog/update-product-availability";
import { bulkUpdateVariants } from "@/application/use-cases/catalog/bulk-update-variants";
const text = (form: FormData, name: string) =>
  String(form.get(name) ?? "").trim();
export async function bulkUpdateVariantsAction(form: FormData) {
  const productId = text(form, "productId");
  return execute(`/admin/products/${productId}/edit`, async () => {
    const availability = text(form, "availability");
    if (availability && availability !== "true" && availability !== "false")
      throw new DomainError("Choose valid availability.");
    await bulkUpdateVariants({
      staffUserId: await staffIdentity(),
      productId,
      revision: parseActionInteger(
        text(form, "revision"),
        "Revision",
        1,
        2147483647,
      ),
      variantIds: form.getAll("variantIds").map(String),
      ...(text(form, "priceCents") === ""
        ? {}
        : {
            priceCents: parseActionInteger(
              text(form, "priceCents"),
              "Price",
              0,
              2147483647,
            ),
          }),
      ...(availability === "" ? {} : { isAvailable: availability === "true" }),
    });
    return `/admin/products/${productId}/edit?saved=true`;
  });
}
export async function setProductPublicationAction(form: FormData) {
  const productId = text(form, "productId");
  return execute(`/admin/products/${productId}/edit`, async () => {
    await updateProductAvailability({
      staffUserId: await staffIdentity(),
      productId,
      isPublished: text(form, "published") === "true",
      quoteVersion: parseActionInteger(
        text(form, "revision"),
        "Revision",
        1,
        2147483647,
      ),
    });
    return `/admin/products/${productId}/edit?saved=true`;
  });
}
export async function changeProductCollectionAction(form: FormData) {
  const productId = text(form, "productId");
  return execute(`/admin/products/${productId}/organization`, async () => {
    await changeCollectionMember({
      staffUserId: await staffIdentity(),
      productId,
      collectionId: text(form, "collectionId"),
      revision: parseActionInteger(
        text(form, "revision"),
        "Revision",
        1,
        2147483647,
      ),
      remove: form.has("remove"),
      sortOrder: parseActionInteger(
        text(form, "sortOrder") || "0",
        "Position",
        0,
        1000000,
      ),
    });
    return `/admin/products/${productId}/organization?saved=1`;
  });
}
export async function changeSpecificationAction(form: FormData) {
  const productId = text(form, "productId");
  return execute(`/admin/products/${productId}/specifications`, async () => {
    await changeSpecification({
      staffUserId: await staffIdentity(),
      productId,
      valueId: text(form, "valueId"),
      revision: parseActionInteger(
        text(form, "revision"),
        "Revision",
        1,
        2147483647,
      ),
      remove: form.has("remove"),
      sortOrder: parseActionInteger(
        text(form, "sortOrder") || "0",
        "Position",
        0,
        1000000,
      ),
    });
    return `/admin/products/${productId}/specifications?saved=1`;
  });
}
async function execute(path: string, work: () => Promise<string | void>) {
  let destination = path;
  try {
    destination = (await work()) || path;
    revalidateTag("catalog");
    revalidatePath("/admin", "layout");
    revalidatePath("/[locale]", "layout");
  } catch (error) {
    destination = `${path}?error=${encodeURIComponent(actionError(error, "admin.admin.catalog-actions", "Unable to save. Please retry."))}`;
  }
  redirect(destination);
}
export async function saveCollectionAction(form: FormData) {
  const id = text(form, "id");
  const path = /^[0-9a-f-]{36}$/i.test(id)
    ? `/admin/collections/${id}`
    : "/admin/collections";
  return execute(path, async () => {
    const saved = await saveCollection({
      staffUserId: await staffIdentity(),
      ...(id
        ? {
            id,
            revision: parseActionInteger(
              text(form, "revision"),
              "Revision",
              1,
              2147483647,
            ),
          }
        : {}),
      title: text(form, "title"),
      handle: text(form, "handle"),
      description: text(form, "description"),
      isPublished: form.has("published"),
    });
    return `/admin/collections/${saved}?saved=1`;
  });
}
export async function changeCollectionMemberAction(form: FormData) {
  const id = text(form, "collectionId");
  const path = /^[0-9a-f-]{36}$/i.test(id)
    ? `/admin/collections/${id}`
    : "/admin/collections";
  return execute(path, async () => {
    await changeCollectionMember({
      staffUserId: await staffIdentity(),
      collectionId: id,
      productId: text(form, "productId"),
      revision: parseActionInteger(
        text(form, "revision"),
        "Revision",
        1,
        2147483647,
      ),
      sortOrder: parseActionInteger(
        text(form, "position") || "0",
        "Position",
        0,
        1000000,
      ),
      remove: form.has("remove"),
    });
    return `${path}?saved=1`;
  });
}
export async function saveCollectionTranslationAction(form: FormData) {
  const id = text(form, "collectionId");
  const path = /^[0-9a-f-]{36}$/i.test(id)
    ? `/admin/collections/${id}`
    : "/admin/collections";
  return execute(path, async () => {
    const locale = text(form, "locale");
    if (locale !== "en" && locale !== "zh")
      throw new DomainError("Invalid locale.");
    await saveCollectionTranslation({
      staffUserId: await staffIdentity(),
      collectionId: id,
      locale,
      title: text(form, "title"),
      description: text(form, "description"),
    });
    return `${path}?saved=1`;
  });
}

export async function saveAttributeAction(form: FormData) {
  return execute("/admin/attributes", async () => {
    const id = await saveAttribute({
      staffUserId: await staffIdentity(),
      ...(text(form, "id") ? { id: text(form, "id") } : {}),
      ...(text(form, "attributeId")
        ? { attributeId: text(form, "attributeId") }
        : {}),
      code: text(form, "code"),
      label: text(form, "label"),
      archived: form.has("archived"),
    });
    return `/admin/attributes/${id}?saved=1`;
  });
}
export async function saveAttributeTranslationAction(form: FormData) {
  return execute("/admin/attributes", async () => {
    const attributeId = text(form, "attributeId");
    await saveAttributeTranslation({
      staffUserId: await staffIdentity(),
      attributeId,
      ...(text(form, "valueId") ? { valueId: text(form, "valueId") } : {}),
      locale: text(form, "locale"),
      label: text(form, "label"),
    });
    return `/admin/attributes/${attributeId}?saved=1`;
  });
}
export async function generateVariantsAction(form: FormData) {
  const id = text(form, "productId");
  const path = /^[0-9a-f-]{36}$/i.test(id)
    ? `/admin/products/${id}/options`
    : "/admin/products";
  return execute(path, async () => {
    const mappings = form.getAll("legacyIds").map((value) => ({
      variantId: String(value),
      key: text(form, `mapping.${value}`),
    }));
    const created = await generateProductVariants({
      staffUserId: await staffIdentity(),
      productId: id,
      quoteVersion: parseActionInteger(
        text(form, "quoteVersion"),
        "Revision",
        1,
        2147483647,
      ),
      prefix: text(form, "prefix"),
      valueIds: form.getAll("values").map(String),
      selectedKeys: form.getAll("keys").map(String),
      priceCents: parseActionInteger(
        text(form, "priceCents"),
        "Default price",
        0,
        2147483647,
      ),
      mappings,
    });
    return `${path}?generated=${created}&priceCents=${encodeURIComponent(text(form, "priceCents"))}`;
  });
}
export async function createDraftProductAction(form: FormData) {
  return execute("/admin/products/new", async () => {
    const result = await createProduct({
      staffUserId: await staffIdentity(),
      title: text(form, "title"),
      handle: text(form, "handle"),
      description: text(form, "description"),
      isPublished: false,
      variants: [],
    });
    return `/admin/products/${result.product.id}/edit?saved=true`;
  });
}
