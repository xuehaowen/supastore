"use server";
import {
  parseActionBoolean,
  parseActionEnum,
  parseActionRequiredText,
} from "@/application/common/request-validation";
import {
  removeStaffMembership,
  updateStaffMembership,
} from "@/application/use-cases/staff/manage-staff";
import { staffIdentity } from "@/infrastructure/web";
import { field, perform } from "./common";
function staffReviewPath(form: FormData) {
  const user = field(form, "targetUserId").slice(0, 200);
  return user
    ? `/admin/setup?staff=${encodeURIComponent(user)}`
    : "/admin/setup";
}
export async function updateStaffMember(form: FormData) {
  return perform(staffReviewPath(form), async () => {
    await updateStaffMembership({
      actorUserId: await staffIdentity(),
      targetUserId: parseActionRequiredText(
        field(form, "targetUserId"),
        "Staff user",
        200,
      ),
      role: parseActionEnum(field(form, "role"), "Staff role", [
        "owner",
        "staff",
      ] as const),
      isActive: parseActionBoolean(field(form, "active"), "Active"),
    });
    return "/admin/setup";
  });
}

export async function removeStaffMember(form: FormData) {
  return perform(staffReviewPath(form), async () => {
    await removeStaffMembership({
      actorUserId: await staffIdentity(),
      targetUserId: parseActionRequiredText(
        field(form, "targetUserId"),
        "Staff user",
        200,
      ),
    });
    return "/admin/setup";
  });
}

export async function sendVerification() {
  return perform("/admin/setup", async () => {
    const { requestEmailVerification } =
      await import("@/application/use-cases/store/verify-email");
    const { getNotificationProviders } =
      await import("@/infrastructure/bootstrap/notification-providers");
    const { trackInFlight } = await import("@/infrastructure/runtime/shutdown");
    const identity = await staffIdentity();
    await trackInFlight(() =>
      requestEmailVerification(identity, getNotificationProviders().email),
    );
    return "/admin/setup?sent=1";
  });
}
export async function verifyEmail(form: FormData) {
  return perform("/admin/setup", async () => {
    const { verifyEmailDelivery } =
      await import("@/application/use-cases/store/verify-email");
    await verifyEmailDelivery(await staffIdentity(), field(form, "token"));
  });
}
