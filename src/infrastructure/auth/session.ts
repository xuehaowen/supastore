import { eq, and } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import { staffMemberships } from '@/infrastructure/db/schema';
import { ForbiddenError, UnauthorizedError } from '@/application/common/errors';

export type StaffRole = 'owner' | 'staff';

export interface VerifiedStaff {
  userId: string;
  email: string;
  role: StaffRole;
}

/**
 * Verify staff active status and role in-transaction directly against staff_memberships.
 * This ensures immediate revocation if deactivated without waiting for JWT/session token expiry.
 */
export async function verifyStaffInTransaction(
  tx: PgTransaction<any, any, any>,
  userId: string,
  requiredRole?: StaffRole
): Promise<VerifiedStaff> {
  if (!userId) {
    throw new UnauthorizedError('User authentication required.');
  }

  const [membership] = await tx
    .select()
    .from(staffMemberships)
    .where(and(eq(staffMemberships.userId, userId), eq(staffMemberships.isActive, true)))
    .limit(1);

  if (!membership) {
    throw new ForbiddenError('Access denied: Active staff membership required.');
  }

  if (requiredRole === 'owner' && membership.role !== 'owner') {
    throw new ForbiddenError('Access denied: Owner privileges required for this operation.');
  }

  return {
    userId: membership.userId,
    email: membership.email,
    role: membership.role as StaffRole,
  };
}
