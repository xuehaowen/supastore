"use server";
import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { smsReadiness } from "@supastore/contracts";
import { db } from "@/infrastructure/db";
import { storeSettings, auditRecords } from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { staffIdentity } from "@/infrastructure/web";
import {
  ConflictError,
  DomainError,
  NotFoundError,
} from "@/application/common/errors";
import { actionError } from "@/infrastructure/http/failure";
export async function saveSmsSettingsAction(form: FormData) {
  let destination = "/admin/settings/sms?saved=1";
  try {
    const staff = await staffIdentity();
    await db.transaction(async (tx) => {
      await verifyStaffInTransaction(tx, staff, "owner");
      const [store] = await tx.select().from(storeSettings).for("update");
      if (!store) throw new NotFoundError("Set up the store first.");
      if (String(store.quoteVersion) !== form.get("revision"))
        throw new ConflictError("Settings changed. Reload before saving.");
      const smsPolicy = {
        enabled: form.get("enabled") === "on",
        reviewed: form.get("reviewed") === "on",
      };
      const readiness = smsReadiness({ ...store, smsPolicy });
      if (smsPolicy.enabled && !readiness.ready)
        throw new DomainError(readiness.issues.join(" "));
      await tx
        .update(storeSettings)
        .set({
          smsPolicy,
          quoteVersion: store.quoteVersion + 1,
          updatedAt: new Date(),
        })
        .where(eq(storeSettings.id, store.id));
      await tx.insert(auditRecords).values({
        entityType: "store_settings",
        entityId: store.id,
        actorId: staff,
        action: "store.sms_settings_saved",
        details: smsPolicy,
      });
    });
    revalidateTag("catalog");
    revalidatePath("/[locale]", "layout");
  } catch (error) {
    destination = `/admin/settings/sms?error=${encodeURIComponent(actionError(error, "admin.sms.settings", "Unable to save SMS settings."))}`;
  }
  redirect(destination);
}
