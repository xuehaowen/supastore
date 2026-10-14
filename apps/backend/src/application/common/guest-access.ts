import { createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Transaction } from "./transaction";
import { guestOrderSessions } from "@/infrastructure/db/schema";
import { UnauthorizedError } from "./errors";
export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export async function verifyOrderAccess(
  tx: Transaction,
  orderId: string,
  token: string,
) {
  const [session] = await tx
    .select()
    .from(guestOrderSessions)
    .where(
      and(
        eq(guestOrderSessions.orderId, orderId),
        eq(guestOrderSessions.tokenHash, hashToken(token)),
        gt(guestOrderSessions.expiresAt, new Date()),
        isNull(guestOrderSessions.revokedAt),
        isNull(guestOrderSessions.recoveryTokenHash),
      ),
    )
    .limit(1);
  if (!session)
    throw new UnauthorizedError("Please recover your order access by email.");
  return session;
}
