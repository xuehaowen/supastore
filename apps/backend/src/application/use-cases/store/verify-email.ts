import { resolvePublicOrigin } from "../../../../../../packages/config/public-origin.mjs";
import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import { verification, storeSettings } from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { hashToken } from "@/application/common/guest-access";
import type { EmailSender } from "@/application/ports/notifications";
import { prepareNotification } from "@/application/notifications/template-manager";
import { InvariantViolationError } from "@/application/common/errors";
export async function requestEmailVerification(
  staffUserId: string,
  sender: EmailSender | undefined,
) {
  if (!sender)
    throw new InvariantViolationError("Email delivery is not configured.");
  const token = randomBytes(32).toString("hex");
  const recipient = await db.transaction(async (tx) => {
    const staff = await verifyStaffInTransaction(tx, staffUserId, "owner");
    await tx.insert(verification).values({
      id: randomUUID(),
      identifier: "store-email:" + staffUserId,
      value: hashToken(token),
      expiresAt: new Date(Date.now() + 86400000),
    });
    return staff.email;
  });
  try {
    const prepared = await db.transaction((tx) =>
      prepareNotification(tx, {
        deliveryId: randomUUID(),
        recipient,
        event: "store.email_verification",
        channel: "email",
        audience: "staff",
        locale: "en",
        payload: {
          verificationUrl:
            resolvePublicOrigin(process.env) +
            "/admin/setup/verify-email?token=" +
            token,
        },
      }),
    );
    if (!("subject" in prepared.message))
      throw new Error("Email template required.");
    const result = await sender.send(prepared.message);
    if (result.status !== "accepted") throw new Error("Delivery not accepted");
  } catch {
    throw new InvariantViolationError(
      "Verification email could not be accepted. Check email provider configuration and delivery status before retrying.",
    );
  }
}
export async function verifyEmailDelivery(staffUserId: string, token: string) {
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staffUserId, "owner");
    const [proof] = await tx
      .delete(verification)
      .where(
        and(
          eq(verification.identifier, "store-email:" + staffUserId),
          eq(verification.value, hashToken(token)),
          gt(verification.expiresAt, new Date()),
        ),
      )
      .returning();
    if (!proof)
      throw new InvariantViolationError(
        "Verification link expired or already used.",
      );
    await tx.update(storeSettings).set({ emailVerifiedAt: new Date() });
  });
}
