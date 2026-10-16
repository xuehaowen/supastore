import { and, asc, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/infrastructure/db";
import type { Transaction } from "@/application/common/transaction";
import {
  notificationTemplates,
  notificationTemplateVersions,
  storeSettings,
  orders,
  orderFulfillments,
  auditRecords,
} from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import {
  ConflictError,
  DomainError,
  NotFoundError,
} from "@/application/common/errors";
import {
  parseActionInteger,
  parseActionUuid,
} from "@/application/common/request-validation";
import {
  definitionFor,
  defaultTemplate,
  renderTemplate,
  validateTemplate,
  templateCoverage,
  type TemplateKey,
} from "./templates";
import { formatLocalDate } from "@supastore/i18n/customer";

export async function listTemplates(staffUserId: string) {
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staffUserId, "owner");
    return tx
      .select()
      .from(notificationTemplates)
      .orderBy(
        asc(notificationTemplates.event),
        asc(notificationTemplates.channel),
        asc(notificationTemplates.audience),
        asc(notificationTemplates.locale),
      );
  });
}
export async function getTemplate(staffUserId: string, id: string) {
  parseActionUuid(id, "Template");
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staffUserId, "owner");
    const [template] = await tx
      .select()
      .from(notificationTemplates)
      .where(eq(notificationTemplates.id, id));
    if (!template) throw new NotFoundError("Notification template not found.");
    const versions = await tx
      .select()
      .from(notificationTemplateVersions)
      .where(eq(notificationTemplateVersions.templateId, id))
      .orderBy(desc(notificationTemplateVersions.version));
    return { template, versions };
  });
}
async function lockTemplate(tx: Transaction, id: string, revision: number) {
  parseActionUuid(id, "Template");
  parseActionInteger(revision, "Draft revision", 1, 2147483646);
  const [row] = await tx
    .select()
    .from(notificationTemplates)
    .where(eq(notificationTemplates.id, id))
    .for("update");
  if (!row) throw new NotFoundError("Notification template not found.");
  if (row.draftRevision !== revision)
    throw new ConflictError(
      "This template changed. Reload before saving or publishing.",
    );
  return row;
}
export async function createTemplateDraft(
  staffUserId: string,
  key: TemplateKey,
) {
  definitionFor(key);
  const content = defaultTemplate(key);
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staffUserId, "owner");
    const [row] = await tx
      .insert(notificationTemplates)
      .values({
        ...key,
        draftSubject: content.subject,
        draftBody: content.body,
      })
      .onConflictDoNothing()
      .returning();
    if (!row)
      throw new ConflictError(
        "This template already exists. Reload the template list.",
      );
    await tx.insert(auditRecords).values({
      entityType: "notification_template",
      entityId: row.id,
      actorId: staffUserId,
      action: "notification.template_created",
    });
    return row.id;
  });
}
export async function saveTemplateDraft(
  staffUserId: string,
  input: { id: string; revision: number; subject: string; body: string },
) {
  if (
    typeof input.subject !== "string" ||
    input.subject.length > 200 ||
    typeof input.body !== "string" ||
    input.body.length > 12000
  )
    throw new DomainError("Draft subject or body is too long.");
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staffUserId, "owner");
    const row = await lockTemplate(tx, input.id, input.revision);
    if (row.channel === "sms" && input.body.length > 500)
      throw new DomainError("SMS drafts must not exceed 500 characters.");
    await tx
      .update(notificationTemplates)
      .set({
        draftSubject: input.subject,
        draftBody: input.body,
        draftRevision: row.draftRevision + 1,
        updatedAt: new Date(),
      })
      .where(eq(notificationTemplates.id, row.id));
    await tx.insert(auditRecords).values({
      entityType: "notification_template",
      entityId: row.id,
      actorId: staffUserId,
      action: "notification.template_draft_saved",
    });
  });
}
export async function publishTemplate(
  staffUserId: string,
  id: string,
  revision: number,
) {
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staffUserId, "owner");
    const row = await lockTemplate(tx, id, revision);
    validateTemplate(row, { subject: row.draftSubject, body: row.draftBody });
    const [last] = await tx
      .select()
      .from(notificationTemplateVersions)
      .where(eq(notificationTemplateVersions.templateId, id))
      .orderBy(desc(notificationTemplateVersions.version))
      .limit(1);
    const version = (last?.version || 0) + 1;
    await tx.insert(notificationTemplateVersions).values({
      templateId: id,
      version,
      subject: row.draftSubject,
      body: row.draftBody,
      publishedBy: staffUserId,
    });
    await tx
      .update(notificationTemplates)
      .set({
        publishedVersion: version,
        draftRevision: row.draftRevision + 1,
        updatedAt: new Date(),
      })
      .where(eq(notificationTemplates.id, id));
    await tx.insert(auditRecords).values({
      entityType: "notification_template",
      entityId: id,
      actorId: staffUserId,
      action: "notification.template_published",
      reason: `Version ${version}`,
    });
    return version;
  });
}
export async function rollbackTemplate(
  staffUserId: string,
  id: string,
  version: number,
  revision: number,
) {
  parseActionInteger(version, "Published version", 1, 2147483647);
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staffUserId, "owner");
    await lockTemplate(tx, id, revision);
    const [previous] = await tx
      .select()
      .from(notificationTemplateVersions)
      .where(
        and(
          eq(notificationTemplateVersions.templateId, id),
          eq(notificationTemplateVersions.version, version),
        ),
      );
    if (!previous) throw new NotFoundError("Published version not found.");
    const [row] = await tx
      .select()
      .from(notificationTemplates)
      .where(eq(notificationTemplates.id, id));
    validateTemplate(row!, previous);
    await tx
      .update(notificationTemplates)
      .set({
        publishedVersion: version,
        draftSubject: previous.subject,
        draftBody: previous.body,
        draftRevision: revision + 1,
        updatedAt: new Date(),
      })
      .where(eq(notificationTemplates.id, id));
    await tx.insert(auditRecords).values({
      entityType: "notification_template",
      entityId: id,
      actorId: staffUserId,
      action: "notification.template_rolled_back",
      reason: `Version ${version}`,
    });
  });
}
export async function publishedTemplateCoverage(
  tx: Transaction | typeof db = db,
) {
  const rows = await tx
    .select()
    .from(notificationTemplates)
    .where(sql`${notificationTemplates.publishedVersion} IS NOT NULL`);
  return templateCoverage(rows);
}
export async function retryTemplateReviews(staffUserId: string) {
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staffUserId, "owner");
    const result = await tx.execute(
      sql`UPDATE event_deliveries SET status='pending', provider_status=NULL, failure_code=NULL, retry_after=now(), updated_at=now() WHERE status='review' AND provider_status='template_preparation_failed' AND attempts=0 AND prepared_message IS NULL AND (expires_at IS NULL OR expires_at > now()) RETURNING id`,
    );
    await tx.insert(auditRecords).values({
      entityType: "notification_template_reviews",
      entityId: randomUUID(),
      actorId: staffUserId,
      action: "notification.template_reviews_requeued",
      reason: `${result.length} unsent notifications`,
    });
    return result.length;
  });
}

type PreparationInput = TemplateKey & {
  deliveryId: string;
  recipient: string;
  payload: Record<string, unknown>;
  orderId?: string;
};
export async function prepareNotification(
  tx: Transaction | typeof db,
  input: PreparationInput,
) {
  definitionFor(input);
  const [template] = await tx
    .select()
    .from(notificationTemplates)
    .where(
      and(
        eq(notificationTemplates.event, input.event),
        eq(notificationTemplates.channel, input.channel),
        eq(notificationTemplates.audience, input.audience),
        eq(notificationTemplates.locale, input.locale),
      ),
    )
    .limit(1);
  if (!template?.publishedVersion)
    throw new DomainError(
      "A required published notification template is missing.",
      "TEMPLATE_NOT_PUBLISHED",
    );
  const [version] = await tx
    .select()
    .from(notificationTemplateVersions)
    .where(
      and(
        eq(notificationTemplateVersions.templateId, template.id),
        eq(notificationTemplateVersions.version, template.publishedVersion),
      ),
    )
    .limit(1);
  if (!version)
    throw new DomainError(
      "Published notification template version is missing.",
      "TEMPLATE_VERSION_MISSING",
    );
  const values = await notificationValues(tx, input);
  return {
    versionId: version.id,
    message: renderTemplate(
      input,
      version,
      values,
      input.deliveryId,
      input.recipient,
    ),
  };
}

function publicOrigin() {
  const origin = new URL(
    process.env.STOREFRONT_ORIGIN ||
      process.env.APP_URL ||
      process.env.BETTER_AUTH_URL ||
      "http://localhost:3000",
  );
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.username ||
    origin.password
  )
    throw new DomainError("Public storefront URL is invalid.");
  return origin.origin;
}
export async function notificationValues(
  tx: Transaction | typeof db,
  input: PreparationInput,
) {
  const [store] = await tx.select().from(storeSettings).limit(1);
  const [order] = input.orderId
    ? await tx
        .select()
        .from(orders)
        .where(eq(orders.id, input.orderId))
        .limit(1)
    : [];
  const terms = (order?.termsSnapshot || {}) as {
    currency?: string;
    precision?: number;
    pickup?: {
      address: string;
      date: string;
      startTime: string;
      endTime: string;
    };
  };
  const currency =
      terms.currency ||
      (typeof input.payload.currency === "string"
        ? input.payload.currency
        : store?.currency) ||
      "USD",
    precision =
      terms.precision ??
      (typeof input.payload.precision === "number"
        ? input.payload.precision
        : store?.precision) ??
      2;
  const p = input.payload,
    zh = input.locale === "zh";
  const money = (value: unknown, fallback = 0) =>
    new Intl.NumberFormat(zh ? "zh-CN" : "en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    }).format(
      (typeof value === "number" && Number.isSafeInteger(value)
        ? value
        : fallback) /
        10 ** precision,
    );
  let received = 0;
  if (order) {
    const [projection] = await tx.execute(
      sql`SELECT coalesce((SELECT sum(amount_cents) FROM payment_receipts WHERE order_id=${order.id}),0) + coalesce((SELECT sum(c.delta_amount_cents) FROM payment_receipt_corrections c JOIN payment_receipts r ON r.id=c.receipt_id WHERE r.order_id=${order.id}),0) - coalesce((SELECT sum(a.settled_amount_cents) FROM payout_allocations a JOIN payment_receipts r ON r.id=a.receipt_id WHERE r.order_id=${order.id} AND a.payment_return_id IS NOT NULL),0) AS received`,
    );
    received = Number(projection?.received || 0);
  }
  const origin = publicOrigin();
  const actionUrl = p.resetUrl || p.verificationUrl || p.recoveryUrl;
  let safeActionUrl = "";
  if (typeof actionUrl === "string") {
    const url = new URL(actionUrl);
    const allowed = new Set([
      origin,
      ...[process.env.BETTER_AUTH_URL, process.env.APP_URL]
        .filter(Boolean)
        .map((value) => new URL(value!).origin),
    ]);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !allowed.has(url.origin) ||
      url.username ||
      url.password
    )
      throw new DomainError(
        "Notification action link has an untrusted origin.",
      );
    safeActionUrl = url.href;
  }
  const reference =
    typeof p.referenceCode === "string"
      ? p.referenceCode
      : order?.referenceCode || (zh ? "您的订单" : "Your order");
  const fallbackDetails = zh ? "请查看订单详情" : "See order details";
  const pickup = terms.pickup;
  const [fulfillment] = order
    ? await tx
        .select()
        .from(orderFulfillments)
        .where(eq(orderFulfillments.orderId, order.id))
        .limit(1)
    : [];
  const total =
    typeof p.purchaseTotalCents === "number"
      ? p.purchaseTotalCents
      : typeof p.totalCents === "number"
        ? p.totalCents
        : order?.purchaseTotalCents || 0;
  return {
    "store.name": store?.storeName || "Store",
    "support.email":
      store?.supportEmail ||
      (zh
        ? "请通过商店网站联系客服"
        : "Contact support through the store website"),
    "order.reference": reference.replace(/[\r\n]/g, " ").slice(0, 100),
    "order.url":
      input.audience === "staff"
        ? `${origin}/admin/orders/${order?.id || ""}`
        : `${origin}/${input.locale}/recover`,
    "order.total": money(total),
    "order.received": money(p.receivedCents, received),
    "order.balance": money(
      p.balanceCents,
      Math.max(0, total - (order?.creditAppliedCents || 0) - received),
    ),
    "fulfillment.pickup": pickup
      ? `${pickup.address} · ${formatLocalDate(pickup.date, input.locale)} · ${pickup.startTime}–${pickup.endTime}`
      : fallbackDetails,
    "fulfillment.tracking":
      [
        p.carrier || fulfillment?.carrier,
        p.trackingNumber || fulfillment?.trackingNumber,
      ]
        .filter((value) => typeof value === "string" && value)
        .join(" · ") || fallbackDetails,
    "action.url": safeActionUrl,
    "sales.total": money(p.observedNetCents),
    "sales.threshold": money(p.thresholdCents),
    "sales.period": `${typeof p.fiscalStart === "string" ? p.fiscalStart : ""} – ${typeof p.fiscalEndExclusive === "string" ? p.fiscalEndExclusive : ""}`,
    "sales.url": `${origin}/admin/reports`,
  };
}
