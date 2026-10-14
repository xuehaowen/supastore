import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  notificationInbox,
  eventDeliveries,
  notificationAttempts,
  notificationAttemptResults,
} from "@/infrastructure/db/schema";
import type { NotificationEvent } from "@/application/ports/notifications";
import { ConflictError, DomainError } from "@/application/common/errors";
import { callbackStatus, type DeliveryStatus } from "./delivery-policy";
import { applyPhoneOptOut } from "@/application/use-cases/customers/sms-preferences";

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
type UnhandledEvent = {
  state: "unhandled";
  provider: string;
  profile: string;
  eventId: string;
  occurredAt: Date;
};
async function persist(
  event: NotificationEvent | UnhandledEvent,
  rawBody?: string,
) {
  if (
    ![event.provider, event.profile, event.eventId].every(
      (value) =>
        typeof value === "string" && value.length > 0 && value.length <= 512,
    ) ||
    !(event.occurredAt instanceof Date) ||
    !Number.isFinite(event.occurredAt.getTime())
  )
    throw new DomainError("Invalid notification callback identity.");
  if (rawBody !== undefined && Buffer.byteLength(rawBody, "utf8") > 16384)
    throw new DomainError("Notification callback exceeds retained body limit.");
  if (event.state !== "unhandled") {
    if (event.state === "opted_out") {
      if (!/^\+[1-9]\d{7,14}$/.test(event.phone))
        throw new DomainError("Invalid notification opt-out phone.");
    } else if (
      !["sent", "delivered", "failed"].includes(event.state) ||
      typeof event.providerMessageId !== "string" ||
      !event.providerMessageId.length ||
      event.providerMessageId.length > 512
    ) {
      throw new DomainError("Invalid notification delivery callback.");
    }
  }
  const payloadHash = fingerprint(
    event.state === "unhandled" ? [event, rawBody ?? null] : event,
  );
  return db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(notificationInbox)
      .values({
        provider: event.provider,
        profile: event.profile,
        eventId: event.eventId,
        payload: event,
        payloadHash,
        rawBody: rawBody ?? null,
        status: event.state === "unhandled" ? "unmatched" : "pending",
      })
      .onConflictDoNothing()
      .returning();
    if (inserted) return inserted.id;
    const [retry] = await tx
      .select()
      .from(notificationInbox)
      .where(
        and(
          eq(notificationInbox.provider, event.provider),
          eq(notificationInbox.profile, event.profile),
          eq(notificationInbox.eventId, event.eventId),
        ),
      );
    if (!retry || retry.payloadHash !== payloadHash)
      throw new ConflictError(
        "Notification event identity was reused with different contents.",
      );
    return retry.id;
  });
}
/** Caller verifies provider signature, raw body and intended profile first. */
export function persistNotificationEvent(
  event: NotificationEvent,
  rawBody?: string,
) {
  return persist(event, rawBody);
}
export function persistUnmatchedNotificationEvent(
  identity: Omit<UnhandledEvent, "state">,
  rawBody: string,
) {
  return persist({ ...identity, state: "unhandled" }, rawBody);
}

export async function wakeNotificationInbox(
  provider: string,
  profile: string,
  providerMessageId: string,
) {
  await db
    .update(notificationInbox)
    .set({ retryAfter: new Date() })
    .where(
      and(
        eq(notificationInbox.provider, provider),
        eq(notificationInbox.profile, profile),
        inArray(notificationInbox.status, ["pending", "unmatched"]),
        sql`${notificationInbox.payload}->>'providerMessageId'=${providerMessageId}`,
      ),
    );
}

/** Locks inbox before delivery; provider acknowledgments must commit before invoking. */
export async function processNotificationInboxBatch(
  options: { batchSize?: number } = {},
) {
  const size = Math.max(1, Math.min(100, options.batchSize ?? 20));
  let processed = 0;
  for (let index = 0; index < size; index++) {
    const result = await db.transaction(async (tx) => {
      const [inbox] = await tx
        .select()
        .from(notificationInbox)
        .where(
          and(
            inArray(notificationInbox.status, ["pending", "unmatched"]),
            sql`${notificationInbox.retryAfter} <= now()`,
          ),
        )
        .orderBy(notificationInbox.createdAt, notificationInbox.id)
        .limit(1)
        .for("update", { skipLocked: true });
      if (!inbox) return false;
      const event = inbox.payload;
      if (event.state === "unhandled") {
        await tx
          .update(notificationInbox)
          .set({
            retryAfter: new Date(Date.now() + 86400000),
            attempts: inbox.attempts + 1,
          })
          .where(eq(notificationInbox.id, inbox.id));
        return true;
      }
      if (event.state === "opted_out") {
        await applyPhoneOptOut(tx, event.phone);
        await tx
          .update(eventDeliveries)
          .set({
            status: "suppressed",
            leaseToken: null,
            leaseExpiresAt: null,
            providerStatus: "opted_out",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(eventDeliveries.channel, "sms"),
              eq(eventDeliveries.recipient, event.phone),
              inArray(eventDeliveries.status, [
                "pending",
                "retrying",
                "dispatching",
              ]),
            ),
          );
      } else {
        let [delivery] = await tx
          .select()
          .from(eventDeliveries)
          .where(
            and(
              eq(eventDeliveries.providerName, event.provider),
              eq(eventDeliveries.providerProfile, event.profile),
              eq(eventDeliveries.providerMessageId, event.providerMessageId),
            ),
          )
          .for("update");
        if (!delivery) {
          // A late result from a fenced/expired attempt still proves its message identity.
          const [late] = await tx
            .select({ deliveryId: notificationAttempts.deliveryId })
            .from(notificationAttemptResults)
            .innerJoin(
              notificationAttempts,
              eq(notificationAttempts.id, notificationAttemptResults.attemptId),
            )
            .where(
              and(
                eq(notificationAttempts.provider, event.provider),
                eq(notificationAttempts.profile, event.profile),
                eq(
                  notificationAttemptResults.providerMessageId,
                  event.providerMessageId,
                ),
                eq(notificationAttemptResults.outcome, "accepted"),
              ),
            )
            .limit(1);
          if (late)
            [delivery] = await tx
              .select()
              .from(eventDeliveries)
              .where(eq(eventDeliveries.id, late.deliveryId))
              .for("update");
        }
        if (!delivery) {
          await tx
            .update(notificationInbox)
            .set({
              status: "unmatched",
              retryAfter: new Date(Date.now() + 300000),
              attempts: inbox.attempts + 1,
            })
            .where(eq(notificationInbox.id, inbox.id));
          return true;
        }
        const occurredAt = new Date(event.occurredAt);
        const older = Boolean(
          delivery.providerEventAt && occurredAt < delivery.providerEventAt,
        );
        const status = callbackStatus(
          delivery.status as DeliveryStatus,
          event.state,
          older,
        );
        await tx
          .update(eventDeliveries)
          .set({
            status,
            providerMessageId: event.providerMessageId,
            providerStatus:
              status === delivery.status && (older || event.state !== status)
                ? delivery.providerStatus
                : event.state,
            providerEventAt:
              delivery.providerEventAt && older
                ? delivery.providerEventAt
                : occurredAt,
            leaseToken: null,
            leaseExpiresAt: null,
            updatedAt: new Date(),
          })
          .where(eq(eventDeliveries.id, delivery.id));
      }
      await tx
        .update(notificationInbox)
        .set({ status: "applied", attempts: inbox.attempts + 1 })
        .where(eq(notificationInbox.id, inbox.id));
      return true;
    });
    if (!result) break;
    processed++;
  }
  return processed;
}
