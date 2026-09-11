import { randomBytes } from 'node:crypto';
import { guestOrderSessions } from '@/infrastructure/db/schema';
import type { Transaction } from '@/application/common/transaction';
import { hashToken } from '@/application/common/guest-access';
export { hashToken } from '@/application/common/guest-access';
// Internal helper: callers authorize cart conversion or recovery first.
export async function issueOrderSession(tx: Transaction, orderId: string) {
  const rawToken = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await tx.insert(guestOrderSessions).values({ orderId, tokenHash: hashToken(rawToken), expiresAt });
  return { rawToken, expiresAt };
}

