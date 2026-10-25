"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { staffIdentity } from "@/infrastructure/web";
import { changeCatalogPlacement } from "@/application/use-cases/catalog/change-catalog-placement";
import { field, perform } from "@/app/actions/common";

export async function saveCatalogPlacement(
  operationOrForm: FormData | string,
  maybeForm?: FormData,
) {
  const form =
    maybeForm instanceof FormData
      ? maybeForm
      : operationOrForm instanceof FormData
        ? operationOrForm
        : new FormData();
  const boundOperation =
    typeof operationOrForm === "string" ? operationOrForm : undefined;
  const kind = field(form, "kind");
  const scopeId = field(form, "scopeId");
  const path =
    kind === "collection-product" && /^[0-9a-f-]{36}$/i.test(scopeId)
      ? `/admin/collections/${scopeId}`
      : kind === "category"
        ? "/admin/categories"
        : kind === "collection"
          ? "/admin/collections"
          : "/admin/products";
  const query = new URLSearchParams();
  for (const name of ["q", "page", "status", "category", "sort", "memberQ"])
    if (field(form, name)) query.set(name, field(form, name).slice(0, 120));
  return perform(`${path}${query.size ? `?${query}` : ""}`, async () => {
    await changeCatalogPlacement({
      staffUserId: await staffIdentity(),
      kind,
      scopeId,
      id: field(form, "id"),
      operation: boundOperation || field(form, "operation") || "save",
      position: field(form, "position"),
      expectedPosition: field(form, "expectedPosition"),
      expectedPinned: field(form, "expectedPinned"),
    });
    revalidateTag("catalog");
    revalidatePath("/[locale]", "layout");
    revalidatePath("/admin", "layout");
  });
}
