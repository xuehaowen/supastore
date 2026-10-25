"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { staffIdentity } from "@/infrastructure/web";
import { setNavigationPosition } from "@/application/use-cases/catalog/set-navigation-position";
import { field, perform } from "@/app/actions/common";

export async function saveNavigationOrder(form: FormData) {
  const kind = field(form, "kind");
  const path =
    kind === "collection" ? "/admin/collections" : "/admin/categories";
  const query = new URLSearchParams({
    q: field(form, "q").slice(0, 120),
    page: /^\d{1,5}$/.test(field(form, "page")) ? field(form, "page") : "1",
  });
  return perform(`${path}?${query}`, async () => {
    await setNavigationPosition({
      staffUserId: await staffIdentity(),
      kind,
      id: field(form, "id"),
      position: field(form, "position"),
      expectedPosition: field(form, "expectedPosition"),
    });
    revalidateTag("catalog");
    revalidatePath("/[locale]", "layout");
    revalidatePath(path);
  });
}
