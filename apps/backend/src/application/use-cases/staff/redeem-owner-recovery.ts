import { eq, and, gt } from "drizzle-orm";
import { randomBytes, randomUUID } from "node:crypto";
import { db } from "@/infrastructure/db";
import {
  user,
  staffSession,
  staffMemberships,
  verification,
  auditRecords,
} from "@/infrastructure/db/schema";
import { UnauthorizedError } from "@/application/common/errors";

export interface RedeemRecoveryOutput {
  sessionToken: string;
  userId: string;
  email: string;
  expiresAt: Date;
}

/**
 * Redeems a one-time owner recovery token, destroys it, and establishes an authenticated owner session.
 */
export async function redeemOwnerRecovery(
  token: string,
): Promise<RedeemRecoveryOutput> {
  if (!token || typeof token !== "string") {
    throw new UnauthorizedError("Recovery token is required.");
  }

  return await db.transaction(async (tx) => {
    const identifier = `owner-recovery:${token}`;

    const [record] = await tx
      .delete(verification)
      .where(
        and(
          eq(verification.identifier, identifier),
          gt(verification.expiresAt, new Date()),
        ),
      )
      .returning();

    if (!record) {
      throw new UnauthorizedError(
        "Recovery link is invalid or has expired. Please run the CLI recovery command again.",
      );
    }

    // DELETE RETURNING gives exactly one transaction ownership of the token.

    const userId = record.value;

    const [targetUser] = await tx
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    const [membership] = await tx
      .select()
      .from(staffMemberships)
      .where(
        and(
          eq(staffMemberships.userId, userId),
          eq(staffMemberships.isActive, true),
        ),
      )
      .limit(1);

    if (!targetUser || !membership || membership.role !== "owner") {
      throw new UnauthorizedError(
        "Target account is not an active owner membership.",
      );
    }

    // Create persistent session (7-day validity)
    const sessionToken = randomBytes(32).toString("hex");
    const sessionExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await tx.insert(staffSession).values({
      id: randomUUID(),
      token: sessionToken,
      userId,
      expiresAt: sessionExpiresAt,
    });

    await tx.insert(auditRecords).values({
      entityType: "staff_memberships",
      entityId: membership.id,
      actorId: userId,
      action: "staff.recovery_token_redeemed",
      reason: "Owner logged in using one-time CLI recovery token",
      details: {
        userId,
        email: targetUser.email,
      },
    });

    return {
      sessionToken,
      userId,
      email: targetUser.email,
      expiresAt: sessionExpiresAt,
    };
  });
}
