import { NotFoundError } from "@/application/common/errors";
import {
  parseActionBoolean,
  parseActionEnum,
  parseActionRequiredText,
  parseActionUuid,
} from "@/application/common/request-validation";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { db } from "@/infrastructure/db";
import {
  auditRecords,
  paymentAccounts,
  storeSettings,
} from "@/infrastructure/db/schema";
import { eq } from "drizzle-orm";

export async function savePaymentAccount(input: {
  staffUserId: string;
  id: string;
  mode: string;
  name: string;
  instructions: string;
  accountType: string;
  active: string;
}) {
  const id = input.id
    ? parseActionUuid(input.id, "Payment account")
    : undefined;
  const changes =
    id && input.mode !== "edit"
      ? { isActive: parseActionBoolean(input.active, "Active") }
      : {
          accountName: parseActionRequiredText(
            input.name,
            "Payment method name",
            120,
          ),
          accountIdentifier: parseActionRequiredText(
            input.instructions,
            "Payment instructions",
            2000,
          ),
          accountType: parseActionEnum(
            input.accountType || (id ? "" : "other"),
            "Payment method type",
            ["cash", "zelle", "venmo", "other"] as const,
          ),
        };
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.staffUserId, "owner");
    await tx.select().from(storeSettings).for("update");
    let account;
    if (id) {
      [account] = await tx
        .update(paymentAccounts)
        .set({ ...changes, updatedAt: new Date() })
        .where(eq(paymentAccounts.id, id))
        .returning();
      if (!account) throw new NotFoundError("Payment account not found.");
    } else {
      // A new account always has all required receiving details.
      if (
        changes.accountName === undefined ||
        changes.accountIdentifier === undefined ||
        changes.accountType === undefined
      )
        throw new NotFoundError("Payment account not found.");
      [account] = await tx
        .insert(paymentAccounts)
        .values({
          accountName: changes.accountName,
          accountIdentifier: changes.accountIdentifier,
          accountType: changes.accountType,
        })
        .returning();
    }
    await tx.insert(auditRecords).values({
      entityType: "payment_account",
      entityId: account!.id,
      actorId: input.staffUserId,
      action: id ? "updated" : "created",
      details: {
        accountType: account!.accountType,
        isActive: account!.isActive,
      },
    });
    return account!;
  });
}
