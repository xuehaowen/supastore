import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  eventDeliveries,
  notificationAttempts,
  notificationAttemptResults,
  smsPreferences,
} from "@/infrastructure/db/schema";
import type {
  EmailMessage,
  SmsMessage,
  NotificationProviders,
  SendResult,
  EmailSender,
  SmsSender,
} from "@/application/ports/notifications";
import { prepareNotification } from "./template-manager";
import { SMS_EVENTS, smsDeliveryAllowed, smsQuietUntil } from "./sms-policy";
import { deliveryOutcome } from "./delivery-policy";
import { logFailure, safeFailureCode } from "@/infrastructure/http/failure";
import {
  processNotificationInboxBatch,
  wakeNotificationInbox,
} from "./notification-inbox";

export interface ProcessNotificationsOptions {
  providers: NotificationProviders;
  batchSize?: number;
  leaseDurationMs?: number;
}
interface Claim {
  id: string;
  leaseToken: string;
  attemptId: string;
  sender: EmailSender | SmsSender;
  prepared: EmailMessage | SmsMessage;
  attempts: number;
  firstSubmittedAt: Date;
  customerId: string | null;
  eventCreatedAt: Date;
  recipient: string;
}

export async function enqueueSmsNotifications() {
  await db.execute(sql`INSERT INTO event_deliveries(event_id,recipient,channel)
    SELECT e.id,p.phone,'sms' FROM outbox_events e
    JOIN orders o ON e.aggregate_id=o.id AND e.aggregate_type='order'
    JOIN sms_preferences p ON p.customer_id=o.customer_id
    WHERE p.opted_in AND p.verified_at IS NOT NULL AND p.consent_at IS NOT NULL AND e.created_at >= p.consent_at
      AND e.created_at > now()-interval '2 days'
      AND e.event_type IN (${sql.join(
        Object.keys(SMS_EVENTS).map((type) => sql`${type}`),
        sql`,`,
      )})
    ON CONFLICT DO NOTHING`);
}

async function recoverExpiredDispatches(channel: "email" | "sms") {
  await db.transaction(async (tx) => {
    const expired = await tx
      .select()
      .from(eventDeliveries)
      .where(
        and(
          eq(eventDeliveries.channel, channel),
          eq(eventDeliveries.status, "dispatching"),
          sql`${eventDeliveries.leaseExpiresAt} < now()`,
        ),
      )
      .limit(100)
      .for("update", { skipLocked: true });
    for (const delivery of expired) {
      const [started] = delivery.lastAttemptId
        ? await tx
            .select()
            .from(notificationAttempts)
            .where(eq(notificationAttempts.id, delivery.lastAttemptId))
        : [];
      if (!started || started.leaseToken !== delivery.leaseToken) {
        // Claim expired before its IO-start transaction. No transport was called.
        await tx
          .update(eventDeliveries)
          .set({
            status: "pending",
            leaseToken: null,
            leaseExpiresAt: null,
            retryAfter: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(eventDeliveries.id, delivery.id));
        continue;
      }
      const outcome = deliveryOutcome(
        { status: "unknown", code: "dispatch_lease_expired" },
        {
          attempts: Math.max(delivery.attempts, 1),
          now: new Date(),
          firstSubmittedAt: delivery.firstSubmittedAt ?? new Date(0),
          capabilities: {
            deliveryTracking: delivery.deliveryTracking,
            ...(delivery.idempotencyWindowMs
              ? { idempotencyWindowMs: delivery.idempotencyWindowMs }
              : {}),
          },
        },
      );
      if (delivery.lastAttemptId)
        await tx
          .insert(notificationAttemptResults)
          .values({
            attemptId: delivery.lastAttemptId,
            resultKey: `${delivery.lastAttemptId}:lease-expired`,
            outcome: "unknown",
            code: "dispatch_lease_expired",
          })
          .onConflictDoNothing();
      await tx
        .update(eventDeliveries)
        .set({
          status: outcome.status,
          retryAfter: outcome.retryAfter,
          providerStatus: outcome.providerStatus,
          leaseToken: null,
          leaseExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(eventDeliveries.id, delivery.id));
    }
  });
}

/** Common transport policy: no SDK, environment or mock transport. */
async function processSingleNotification(
  channel: "email" | "sms",
  options: ProcessNotificationsOptions,
) {
  const sender =
    channel === "email" ? options.providers.email : options.providers.sms;
  if (!sender) return { processed: 0, handled: 0 };
  const batchSize = 1;
  const leaseDurationMs = Math.max(
    1000,
    Math.min(300000, options.leaseDurationMs ?? 120000),
  );
  let handled = 0;
  const claims = await db.transaction(async (tx) => {
    const rows = await tx.execute(sql`
      SELECT d.*,e.event_type,e.payload,e.created_at AS event_created_at,o.customer_id,o.id AS order_id,o.notification_locale
      FROM event_deliveries d JOIN outbox_events e ON e.id=d.event_id
      LEFT JOIN orders o ON e.aggregate_type='order' AND o.id=e.aggregate_id
      WHERE d.channel=${channel} AND d.status IN ('pending','retrying') AND d.retry_after <= now()
        AND (d.lease_expires_at IS NULL OR d.lease_expires_at < now())
        AND NOT EXISTS(SELECT 1 FROM event_deliveries older JOIN outbox_events old_event ON old_event.id=older.event_id
          WHERE old_event.aggregate_id=e.aggregate_id AND old_event.aggregate_type=e.aggregate_type
            AND older.recipient=d.recipient AND older.channel=d.channel
            AND old_event.sequence < e.sequence AND older.status IN ('pending','retrying','dispatching','review'))
      ORDER BY d.created_at,d.id LIMIT ${batchSize} FOR UPDATE OF d SKIP LOCKED`);
    handled = rows.length;
    const claimed: Claim[] = [];
    for (const row of rows) {
      const id = String(row.id),
        recipient = String(row.recipient),
        eventCreatedAt = new Date(String(row.event_created_at));
      if (row.expires_at && new Date(String(row.expires_at)) <= new Date()) {
        await tx
          .update(eventDeliveries)
          .set({
            status: "suppressed",
            providerStatus: "notification_expired",
            preparedMessage: null,
            updatedAt: new Date(),
          })
          .where(eq(eventDeliveries.id, id));
        continue;
      }
      if (
        row.provider_name &&
        (row.provider_name !== sender.identity.provider ||
          row.provider_profile !== sender.identity.profile)
      ) {
        await tx
          .update(eventDeliveries)
          .set({
            status: "review",
            providerStatus: "pinned_provider_unavailable",
          })
          .where(eq(eventDeliveries.id, id));
        continue;
      }
      if (
        row.provider_name &&
        (Boolean(row.delivery_tracking) !==
          sender.capabilities.deliveryTracking ||
          (row.idempotency_window_ms
            ? Number(row.idempotency_window_ms)
            : undefined) !== sender.capabilities.idempotencyWindowMs)
      ) {
        await tx
          .update(eventDeliveries)
          .set({
            status: "review",
            providerStatus: "pinned_transport_guarantee_changed",
          })
          .where(eq(eventDeliveries.id, id));
        continue;
      }
      let preference: typeof smsPreferences.$inferSelect | undefined;
      if (channel === "sms") {
        if (row.customer_id)
          [preference] = await tx
            .select()
            .from(smsPreferences)
            .where(eq(smsPreferences.customerId, String(row.customer_id)));
        if (!smsDeliveryAllowed(preference, recipient, eventCreatedAt)) {
          await tx
            .update(eventDeliveries)
            .set({
              status: "suppressed",
              providerStatus: "consent_unavailable",
              leaseToken: null,
              leaseExpiresAt: null,
            })
            .where(eq(eventDeliveries.id, id));
          continue;
        }
        const quiet = smsQuietUntil(preference!.timezone, new Date());
        if (quiet) {
          await tx
            .update(eventDeliveries)
            .set({ retryAfter: quiet })
            .where(eq(eventDeliveries.id, id));
          continue;
        }
      }
      let prepared = row.prepared_message as EmailMessage | SmsMessage | null;
      let templateVersionId = row.template_version_id
        ? String(row.template_version_id)
        : null;
      if (!prepared) {
        try {
          const payload = row.payload as Record<string, unknown>;
          const output = await prepareNotification(tx, {
            event: String(row.event_type),
            channel,
            audience: row.audience === "staff" ? "staff" : "customer",
            locale:
              (channel === "sms"
                ? preference!.locale
                : payload.locale || row.notification_locale) === "zh"
                ? "zh"
                : "en",
            deliveryId: id,
            recipient,
            payload,
            ...(row.order_id ? { orderId: String(row.order_id) } : {}),
          });
          prepared = output.message;
          templateVersionId = output.versionId;
        } catch (error) {
          logFailure(error, "notification.prepare", { deliveryId: id });
          await tx
            .update(eventDeliveries)
            .set({
              status: "review",
              providerStatus: "template_preparation_failed",
              failureCode: safeFailureCode(error),
              updatedAt: new Date(),
            })
            .where(eq(eventDeliveries.id, id));
          continue;
        }
      }
      const leaseToken = randomUUID(),
        attemptId = randomUUID(),
        attempts = Number(row.attempts) + 1;
      const firstSubmittedAt = row.first_submitted_at
        ? new Date(String(row.first_submitted_at))
        : new Date();
      const capabilities = row.provider_name
        ? {
            deliveryTracking: Boolean(row.delivery_tracking),
            idempotencyWindowMs: row.idempotency_window_ms
              ? Number(row.idempotency_window_ms)
              : undefined,
          }
        : sender.capabilities;
      if (
        row.provider_status === "dispatch_lease_expired" ||
        String(row.provider_status ?? "").startsWith("unknown:")
      ) {
        if (
          !capabilities.idempotencyWindowMs ||
          Date.now() >=
            firstSubmittedAt.getTime() + capabilities.idempotencyWindowMs
        ) {
          await tx
            .update(eventDeliveries)
            .set({
              status: "review",
              providerStatus: "idempotency_window_expired",
            })
            .where(eq(eventDeliveries.id, id));
          continue;
        }
      }
      await tx
        .update(eventDeliveries)
        .set({
          status: "dispatching",
          leaseToken,
          leaseExpiresAt: new Date(Date.now() + leaseDurationMs),
          preparedMessage: prepared,
          templateVersionId,
          providerName: sender.identity.provider,
          providerProfile: sender.identity.profile,
          deliveryTracking: capabilities.deliveryTracking,
          idempotencyWindowMs: capabilities.idempotencyWindowMs ?? null,
          updatedAt: new Date(),
        })
        .where(eq(eventDeliveries.id, id));
      claimed.push({
        id,
        leaseToken,
        attemptId,
        sender,
        prepared,
        attempts,
        firstSubmittedAt,
        customerId: row.customer_id ? String(row.customer_id) : null,
        eventCreatedAt,
        recipient,
      });
    }
    return claimed;
  });
  for (const claim of claims) {
    const authorized = await db.transaction(async (tx) => {
      const [delivery] = await tx
        .select()
        .from(eventDeliveries)
        .where(
          and(
            eq(eventDeliveries.id, claim.id),
            eq(eventDeliveries.leaseToken, claim.leaseToken),
            eq(eventDeliveries.status, "dispatching"),
          ),
        )
        .for("update");
      if (
        !delivery ||
        !delivery.leaseExpiresAt ||
        delivery.leaseExpiresAt <= new Date()
      )
        return false;
      if (delivery.expiresAt && delivery.expiresAt <= new Date()) {
        await tx
          .update(eventDeliveries)
          .set({
            status: "suppressed",
            providerStatus: "notification_expired",
            preparedMessage: null,
            leaseToken: null,
            leaseExpiresAt: null,
            updatedAt: new Date(),
          })
          .where(eq(eventDeliveries.id, claim.id));
        return false;
      }
      if (channel === "sms") {
        const [preference] = claim.customerId
          ? await tx
              .select()
              .from(smsPreferences)
              .where(eq(smsPreferences.customerId, claim.customerId))
          : [];
        if (
          !smsDeliveryAllowed(preference, claim.recipient, claim.eventCreatedAt)
        ) {
          await tx
            .update(eventDeliveries)
            .set({
              status: "suppressed",
              providerStatus: "consent_changed",
              leaseToken: null,
              leaseExpiresAt: null,
            })
            .where(eq(eventDeliveries.id, claim.id));
          return false;
        }
        const quiet = smsQuietUntil(preference!.timezone, new Date());
        if (quiet) {
          await tx
            .update(eventDeliveries)
            .set({
              status: "pending",
              retryAfter: quiet,
              providerStatus:
                delivery.providerStatus === "dispatch_lease_expired" ||
                delivery.providerStatus?.startsWith("unknown:")
                  ? delivery.providerStatus
                  : "quiet_hours",
              leaseToken: null,
              leaseExpiresAt: null,
            })
            .where(eq(eventDeliveries.id, claim.id));
          return false;
        }
      }
      claim.firstSubmittedAt = delivery.firstSubmittedAt ?? new Date();
      await tx.insert(notificationAttempts).values({
        id: claim.attemptId,
        deliveryId: claim.id,
        requestId: claim.id,
        attemptNumber: claim.attempts,
        leaseToken: claim.leaseToken,
        provider: claim.sender.identity.provider,
        profile: claim.sender.identity.profile,
        preparedMessage: claim.prepared,
      });
      await tx
        .update(eventDeliveries)
        .set({
          attempts: claim.attempts,
          firstSubmittedAt: claim.firstSubmittedAt,
          lastAttemptId: claim.attemptId,
        })
        .where(eq(eventDeliveries.id, claim.id));
      return true;
    });
    if (!authorized) continue;
    const started = Date.now();
    let result: SendResult;
    try {
      result =
        channel === "email"
          ? await (claim.sender as EmailSender).send(
              claim.prepared as EmailMessage,
            )
          : await (claim.sender as SmsSender).send(
              claim.prepared as SmsMessage,
            );
    } catch (error) {
      logFailure(error, "notification.transport", { deliveryId: claim.id });
      result = { status: "unknown", code: "transport_exception" };
    }
    await db.transaction(async (tx) => {
      await tx
        .insert(notificationAttemptResults)
        .values({
          attemptId: claim.attemptId,
          resultKey: `${claim.attemptId}:provider`,
          outcome: result.status,
          providerMessageId:
            result.status === "accepted" ? result.providerMessageId : null,
          code: result.status === "accepted" ? null : result.code,
          durationMs: Math.max(0, Math.min(2147483647, Date.now() - started)),
        })
        .onConflictDoNothing();
      const [delivery] = await tx
        .select()
        .from(eventDeliveries)
        .where(
          and(
            eq(eventDeliveries.id, claim.id),
            eq(eventDeliveries.leaseToken, claim.leaseToken),
            eq(eventDeliveries.status, "dispatching"),
          ),
        )
        .for("update");
      if (!delivery) return;
      const hadUncertainty =
        delivery.providerStatus === "dispatch_lease_expired" ||
        Boolean(delivery.providerStatus?.startsWith("unknown:"));
      const outcome = deliveryOutcome(result, {
        attempts: claim.attempts,
        firstSubmittedAt: claim.firstSubmittedAt,
        now: new Date(),
        hadUncertainty,
        capabilities: {
          deliveryTracking: delivery.deliveryTracking,
          ...(delivery.idempotencyWindowMs
            ? { idempotencyWindowMs: delivery.idempotencyWindowMs }
            : {}),
        },
      });
      await tx
        .update(eventDeliveries)
        .set({
          status: outcome.status,
          retryAfter: outcome.retryAfter,
          providerStatus:
            result.status === "unknown" ||
            (hadUncertainty && result.status === "rejected")
              ? `unknown:${result.code}`
              : outcome.providerStatus,
          failureCode: result.status === "accepted" ? null : result.code,
          providerMessageId:
            result.status === "accepted"
              ? result.providerMessageId
              : delivery.providerMessageId,
          leaseToken: null,
          leaseExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(eventDeliveries.id, claim.id),
            eq(eventDeliveries.leaseToken, claim.leaseToken),
          ),
        );
    });
    if (result.status === "accepted")
      await wakeNotificationInbox(
        claim.sender.identity.provider,
        claim.sender.identity.profile,
        result.providerMessageId,
      );
  }
  await processNotificationInboxBatch({ batchSize: 20 });
  return { processed: claims.length, handled };
}

/** Claim immediately before each bounded network call, so later work never
 * ages behind earlier submissions while holding a misleading send lease. */
export async function processNotificationBatch(
  channel: "email" | "sms",
  options: ProcessNotificationsOptions,
) {
  // Recovery describes prior submissions and does not require a currently enabled sender.
  await recoverExpiredDispatches(channel);
  // Expired, never-submitted links need no provider reconciliation, including
  // template reviews and queues whose provider is currently disabled.
  await db.execute(sql`UPDATE event_deliveries SET status='suppressed', provider_status='notification_expired',
    prepared_message=NULL, lease_token=NULL, lease_expires_at=NULL, updated_at=now()
    WHERE id IN (SELECT id FROM event_deliveries WHERE channel=${channel}
      AND expires_at <= now() AND attempts=0 AND status IN ('pending','retrying','review')
      ORDER BY expires_at,id LIMIT 100 FOR UPDATE SKIP LOCKED)`);
  const batchSize = Math.max(1, Math.min(100, options.batchSize ?? 10));
  let processed = 0;
  for (let index = 0; index < batchSize; index++) {
    const result = await processSingleNotification(channel, options);
    processed += result.processed;
    if (!result.handled) break;
  }
  return processed;
}
