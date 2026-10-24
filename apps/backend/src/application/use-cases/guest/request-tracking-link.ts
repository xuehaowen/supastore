import { resolvePublicOrigin } from "../../../../../../packages/config/public-origin.mjs";
import { normalizeDisplayReference } from "@/domain/money/display-reference";
import { allowRequest } from "@/application/common/rate-limit";
import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import * as v from "valibot";
import { db } from "@/infrastructure/db";
import { orders, guestOrderSessions } from "@/infrastructure/db/schema";
import { hashToken } from "@/application/common/guest-access";
import { emitOrderEvent } from "@/application/common/events";
import { acquireTransactionLocks } from "@/domain/locking/lock-order";
export async function requestTrackingLink(input: {
  email: string;
  referenceCode: string;
  locale?: string;
}) {
  const email = v
    .parse(v.pipe(v.string(), v.trim(), v.email()), input.email)
    .toLowerCase();
  if (!allowRequest("recovery:" + hashToken(email)))
    return {
      success: true,
      message: "If an order was found, a recovery link has been sent.",
    };
  await db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(
        and(
          sql`lower(${orders.guestEmail}) = ${email}`,
          eq(
            orders.referenceCode,
            normalizeDisplayReference(input.referenceCode),
          ),
        ),
      )
      .limit(1);
    if (!order) return;
    await acquireTransactionLocks(tx, { orderIds: [order.id] });
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await tx.insert(guestOrderSessions).values({
      orderId: order.id,
      tokenHash: hashToken(randomBytes(32).toString("hex")),
      recoveryTokenHash: hashToken(token),
      expiresAt,
    });
    await emitOrderEvent(
      tx,
      order.id,
      "order.access_recovery",
      order.guestEmail,
      {
        orderId: order.id,
        referenceCode: order.referenceCode,
        recoveryUrl: `${resolvePublicOrigin(process.env)}/recover/exchange?token=${token}&locale=${input.locale === "zh" ? "zh" : "en"}`,
        expiresAt: expiresAt.toISOString(),
        locale: input.locale === "zh" ? "zh" : "en",
      },
    );
  });
  return {
    success: true,
    message: "If an order was found, a recovery link has been sent.",
  };
}
