"use server";
import { actionError } from "@/infrastructure/http/failure";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { staffIdentity } from "@/infrastructure/web";
import {
  createTemplateDraft,
  saveTemplateDraft,
  publishTemplate,
  rollbackTemplate,
  retryTemplateReviews,
} from "@/application/notifications/template-manager";
import { parseActionInteger } from "@/application/common/request-validation";
import type { TemplateKey } from "@/application/notifications/templates";

const base = "/admin/settings/notifications";
const text = (form: FormData, key: string) => String(form.get(key) || "");
const revision = (form: FormData) =>
  parseActionInteger(text(form, "revision"), "Draft revision", 1, 2147483646);
async function perform(
  form: FormData,
  operation: () => Promise<void>,
  notice: string,
) {
  const id = text(form, "id");
  const path = /^[0-9a-f-]{36}$/i.test(id) ? `${base}/${id}` : base;
  let target = `${path}?saved=${notice}`;
  try {
    await operation();
    revalidatePath(base, "layout");
  } catch (error) {
    target = `${path}?error=${encodeURIComponent(actionError(error, "admin.admin.settings.notifications.actions", "Unable to update the template. Please retry."))}`;
  }
  redirect(target);
}
export async function saveDraftAction(form: FormData) {
  return perform(
    form,
    async () => {
      await saveTemplateDraft(await staffIdentity(), {
        id: text(form, "id"),
        revision: revision(form),
        subject: text(form, "subject"),
        body: text(form, "body"),
      });
    },
    "draft",
  );
}
export async function publishAction(form: FormData) {
  return perform(
    form,
    async () => {
      await publishTemplate(
        await staffIdentity(),
        text(form, "id"),
        revision(form),
      );
    },
    "published",
  );
}
export async function rollbackAction(form: FormData) {
  return perform(
    form,
    async () => {
      await rollbackTemplate(
        await staffIdentity(),
        text(form, "id"),
        parseActionInteger(text(form, "version"), "Version", 1, 2147483647),
        revision(form),
      );
    },
    "restored",
  );
}
export async function createDraftAction(form: FormData) {
  return perform(
    form,
    async () => {
      await createTemplateDraft(await staffIdentity(), {
        event: text(form, "event"),
        channel: text(form, "channel"),
        audience: text(form, "audience"),
        locale: text(form, "locale"),
      } as TemplateKey);
    },
    "created",
  );
}
export async function retryReviewsAction(form: FormData) {
  return perform(
    form,
    async () => {
      await retryTemplateReviews(await staffIdentity());
    },
    "requeued",
  );
}
