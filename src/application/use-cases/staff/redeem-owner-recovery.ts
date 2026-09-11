import { eq, and, sql } from "drizzle-orm";
import { randomBytes, randomUUID } from "node:crypto";
import { db } from "@/infrastructure/db";
import {
  user,
  session,
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
  token: string
): Promise<RedeemRecoveryOutput> {
  if (!token || typeof token !== "string") {
    throw new UnauthorizedError("Recovery token is required.");
  }

  return await db.transaction(async (tx) => {
    const identifier = `owner-recovery:${token}`;

    const [record] = await tx
      .select()
      .from(verification)
      .where(eq(verification.identifier, identifier))
      .limit(1);

    if (!record || record.expiresAt.getTime() <= Date.now()) {
      // Clean up expired token if exists
      if (record) {
        await tx
          .delete(verification)
          .where(eq(verification.id, record.id));
      }
      throw new UnauthorizedError(
        "Recovery link is invalid or has expired. Please run the CLI recovery command again."
      );
    }

    // Atomic consumption - delete record so it can never be reused
    await tx
      .delete(verification)
      .where(eq(verification.id, record.id));

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
          eq(staffMemberships.isActive, true)
        )
      )
      .limit(1);

    if (!targetUser || !membership || membership.role !== "owner") {
      throw new UnauthorizedError(
        "Target account is not an active owner membership."
      );
    }

    // Create persistent session (7-day validity)
    const sessionToken = randomBytes(32).toString("hex");
    const sessionExpiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    );

    await tx.insert(session).values({
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
