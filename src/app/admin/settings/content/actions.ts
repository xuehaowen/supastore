"use server";
import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import { storeSettings, auditRecords } from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { staffIdentity } from "@/infrastructure/web";
import {
  ConflictError,
  DomainError,
  NotFoundError,
} from "@/application/common/errors";
export async function saveStoreContentAction(form: FormData) {
  let destination = "/admin/settings/content?saved=1";
  try {
    const staff = await staffIdentity();
    await db.transaction(async (tx) => {
      await verifyStaffInTransaction(tx, staff, "owner");
      const [store] = await tx.select().from(storeSettings).for("update");
      if (!store) throw new NotFoundError("Set up the store first.");
      if (String(store.quoteVersion) !== String(form.get("revision")))
        throw new ConflictError("Settings changed. Reload before saving.");
      const content: typeof store.publicContent = {};
      for (const locale of ["en", "zh"] as const) {
        content[locale] = {};
        for (const key of [
          "about",
          "shipping",
          "returns",
          "privacy",
        ] as const) {
          const value = String(form.get(`${locale}.${key}`) ?? "").trim();
          if (value.length > 10000)
            throw new DomainError(
              "Each page supports up to 10,000 characters.",
            );
          content[locale]![key] = value;
        }
      }
      await tx
        .update(storeSettings)
        .set({
          publicContent: content,
          quoteVersion: store.quoteVersion + 1,
          updatedAt: new Date(),
        })
        .where(eq(storeSettings.id, store.id));
      await tx
        .insert(auditRecords)
        .values({
          entityType: "store_settings",
          entityId: store.id,
          actorId: staff,
          action: "store.content_saved",
        });
    });
    revalidateTag("catalog");
    revalidatePath("/[locale]", "layout");
  } catch (error) {
    destination = `/admin/settings/content?error=${encodeURIComponent(error instanceof DomainError ? error.message : "Unable to save store content.")}`;
  }
  redirect(destination);
}
