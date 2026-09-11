import { eq, and, sql, ne } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  staffMemberships,
  user,
  auditRecords,
} from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import {
  ForbiddenError,
  NotFoundError,
  InvariantViolationError,
} from "@/application/common/errors";

export interface UpdateStaffMembershipInput {
  actorUserId: string;
  targetUserId: string;
  role?: "owner" | "staff";
  isActive?: boolean;
}

export interface RemoveStaffMembershipInput {
  actorUserId: string;
  targetUserId: string;
}

/**
 * Asserts under transaction lock that modifying or removing the specified target
 * will not leave the store with zero active owner memberships.
 */
async function assertRemainingActiveOwnerGuard(
  tx: any,
  targetUserId: string,
  operation: "deactivate" | "demote" | "delete"
) {
  // Lock all active owners to serialize guard check against concurrent operations
  const activeOwners = await tx
    .select({
      id: staffMemberships.id,
      userId: staffMemberships.userId,
    })
    .from(staffMemberships)
    .where(
      and(
        eq(staffMemberships.role, "owner"),
        eq(staffMemberships.isActive, true)
      )
    )
    .for("update");

  const otherActiveOwners = activeOwners.filter(
    (o: { userId: string }) => o.userId !== targetUserId
  );

  if (otherActiveOwners.length === 0) {
    const actionVerb =
      operation === "deactivate"
        ? "deactivate"
        : operation === "demote"
        ? "demote"
        : "delete";
    throw new InvariantViolationError(
      `Cannot ${actionVerb} the last remaining active owner membership. The store must always retain at least one active owner.`
    );
  }
}

/**
 * Updates a staff member's role or active status with strict owner permission
 * and last-owner protection.
 */
export async function updateStaffMembership(input: UpdateStaffMembershipInput) {
  return await db.transaction(async (tx) => {
    // Only active owners can manage staff memberships
    await verifyStaffInTransaction(tx, input.actorUserId, "owner");

    const [target] = await tx
      .select()
      .from(staffMemberships)
      .where(eq(staffMemberships.userId, input.targetUserId))
      .limit(1)
      .for("update");

    if (!target) {
      throw new NotFoundError("Staff membership not found for user.");
    }

    const isCurrentActiveOwner = target.role === "owner" && target.isActive;

    // Check last active owner guard if target is an active owner and is being deactivated or demoted
    if (isCurrentActiveOwner) {
      if (input.isActive === false) {
        await assertRemainingActiveOwnerGuard(tx, input.targetUserId, "deactivate");
      }
      if (input.role === "staff") {
        await assertRemainingActiveOwnerGuard(tx, input.targetUserId, "demote");
      }
    }

    const updates: Partial<typeof staffMemberships.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.role !== undefined) updates.role = input.role;
    if (input.isActive !== undefined) updates.isActive = input.isActive;

    const [updated] = await tx
      .update(staffMemberships)
      .set(updates)
      .where(eq(staffMemberships.id, target.id))
      .returning();

    await tx.insert(auditRecords).values({
      entityType: "staff_memberships",
      entityId: target.id,
      actorId: input.actorUserId,
      action: "staff.membership_updated",
      reason: "Staff membership updated by owner",
      details: {
        previousRole: target.role,
        previousActive: target.isActive,
        newRole: updated!.role,
        newActive: updated!.isActive,
      },
    });

    return updated!;
  });
}

/**
 * Permanently removes a staff membership with strict owner permission
 * and last-owner protection.
 */
export async function removeStaffMembership(input: RemoveStaffMembershipInput) {
  return await db.transaction(async (tx) => {
    // Only active owners can remove staff memberships
    await verifyStaffInTransaction(tx, input.actorUserId, "owner");

    const [target] = await tx
      .select()
      .from(staffMemberships)
      .where(eq(staffMemberships.userId, input.targetUserId))
      .limit(1)
      .for("update");

    if (!target) {
      throw new NotFoundError("Staff membership not found for user.");
    }

    if (target.role === "owner" && target.isActive) {
      await assertRemainingActiveOwnerGuard(tx, input.targetUserId, "delete");
    }

    await tx
      .delete(staffMemberships)
      .where(eq(staffMemberships.id, target.id));

    await tx.insert(auditRecords).values({
      entityType: "staff_memberships",
      entityId: target.id,
      actorId: input.actorUserId,
      action: "staff.membership_deleted",
      reason: "Staff membership deleted by owner",
      details: {
        deletedUserId: target.userId,
        deletedEmail: target.email,
        deletedRole: target.role,
      },
    });

    return { success: true, deletedUserId: target.userId };
  });
}
