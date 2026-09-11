import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/infrastructure/db';
import { guestOrderSessions } from '@/infrastructure/db/schema';
import { hashToken } from '@/application/common/guest-access';
import { UnauthorizedError } from '@/application/common/errors';
import { issueOrderSession } from './create-guest-session';
export async function verifyTrackingLink(input: { recoveryToken: string }) {
  return db.transaction(async tx => {
    const [consumed] = await tx.update(guestOrderSessions).set({ recoveryUsedAt: new Date() }).where(and(
      eq(guestOrderSessions.recoveryTokenHash, hashToken(input.recoveryToken)),
      isNull(guestOrderSessions.recoveryUsedAt), isNull(guestOrderSessions.revokedAt),
      gt(guestOrderSessions.expiresAt, new Date()),
    )).returning();
    if (!consumed) throw new UnauthorizedError('Invalid, expired, or already used recovery link.');
    const session = await issueOrderSession(tx, consumed.orderId);
    return { orderId: consumed.orderId, sessionToken: session.rawToken, expiresAt: session.expiresAt };
  });
}

