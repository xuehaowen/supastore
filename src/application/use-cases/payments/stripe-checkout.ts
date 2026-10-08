import { and, eq, asc } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  orders,
  paymentAccounts,
  paymentReceipts,
  orderProposals,
  stripeCheckoutAttempts,
  stripeWebhookInbox,
  auditRecords,
} from "@/infrastructure/db/schema";
import { verifyOrderAccess } from "@/application/common/guest-access";
import { acquireTransactionLocks } from "@/domain/locking/lock-order";
import { DomainError, NotFoundError } from "@/application/common/errors";
import {
  stripeFromEnvironment,
  type StripeAdapter,
  type StripeEvent,
  type StripeSession,
} from "@/infrastructure/payments/stripe";
import { confirmOrderInTransaction } from "@/application/use-cases/confirm-order";
import { expireProviderOrder } from "./expire-provider-order";
import type { QuoteTerms } from "@/application/use-cases/get-quote";
import { parseActionUuid } from "@/application/common/request-validation";
import { stripeCurrencyIssue } from "@/domain/stripe-currency";
const providerActor = "provider:stripe";

/** Accept and persist intent first. Provider IO deliberately happens after commit. */
export async function startStripeCheckout(
  input: { orderId: string; sessionToken: string; locale?: string },
  adapter: StripeAdapter = stripeFromEnvironment(),
) {
  const orderId = parseActionUuid(input.orderId, "Order");
  const attempt = await db.transaction(async (tx) => {
    await acquireTransactionLocks(tx, { orderIds: [orderId] });
    await verifyOrderAccess(tx, orderId, input.sessionToken);
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, orderId));
    if (!order || order.lifecycleStatus !== "unpaid")
      throw new DomainError("Only unpaid orders can start payment.");
    const terms = order.termsSnapshot as QuoteTerms;
    const amountCents = order.purchaseTotalCents - order.creditAppliedCents;
    const unitIssue = stripeCurrencyIssue(
      terms.currency,
      terms.precision,
      amountCents,
    );
    if (unitIssue) throw new DomainError(unitIssue);
    const [existing] = await tx
      .select()
      .from(stripeCheckoutAttempts)
      .where(eq(stripeCheckoutAttempts.orderId, orderId));
    if (existing) {
      const existingUnitIssue = stripeCurrencyIssue(
        existing.currency,
        terms.precision,
        existing.amountCents,
      );
      if (
        existingUnitIssue ||
        existing.currency !== terms.currency.toLowerCase()
      )
        throw new DomainError(
          existingUnitIssue ||
            "Existing payment currency requires merchant review.",
        );
      if (["paid", "expired", "review"].includes(existing.status))
        throw new DomainError(
          "Payment requires merchant review; do not send another payment.",
        );
      return existing;
    }
    if (
      (
        await tx
          .select({ id: paymentReceipts.id })
          .from(paymentReceipts)
          .where(eq(paymentReceipts.orderId, orderId))
          .limit(1)
      ).length
    )
      throw new DomainError(
        "An existing payment requires merchant review before online checkout.",
      );
    if (
      (
        await tx
          .select({ id: orderProposals.id })
          .from(orderProposals)
          .where(
            and(
              eq(orderProposals.orderId, orderId),
              eq(orderProposals.status, "pending"),
            ),
          )
          .limit(1)
      ).length
    )
      throw new DomainError("Accept updated order terms before paying.");
    if (amountCents <= 0)
      throw new DomainError("No external payment is required.");
    const [saved] = await tx
      .insert(stripeCheckoutAttempts)
      .values({
        orderId,
        amountCents,
        currency: terms.currency.toLowerCase(),
        financialRevision: order.financialRevision,
        idempotencyKey: `checkout:${orderId}:${order.financialRevision}`,
      })
      .returning();
    return saved!;
  });
  if (attempt.checkoutUrl && attempt.sessionId)
    return { sessionId: attempt.sessionId, url: attempt.checkoutUrl };
  if (Date.now() - attempt.createdAt.getTime() > 23 * 3600000) {
    await db
      .update(stripeCheckoutAttempts)
      .set({
        status: "review",
        reviewReason:
          "Uncertain session creation exceeded the safe provider idempotency retry window.",
        updatedAt: new Date(),
      })
      .where(eq(stripeCheckoutAttempts.id, attempt.id));
    throw new DomainError(
      "Payment creation requires provider reconciliation before another attempt.",
    );
  }
  const origin = process.env.STOREFRONT_ORIGIN || process.env.APP_URL;
  if (!origin)
    throw new DomainError("Public storefront URL is not configured.");
  const locale = input.locale === "zh" ? "zh" : "en";
  const callback = new URL(`/${locale}/orders/${orderId}`, origin).href;
  const session = await adapter.createCheckoutSession({
    orderId,
    amountCents: attempt.amountCents,
    currency: attempt.currency,
    successUrl: callback,
    cancelUrl: callback,
    idempotencyKey: attempt.idempotencyKey,
  });
  if (
    session.metadata.orderId !== orderId ||
    session.amount_total !== attempt.amountCents ||
    session.currency !== attempt.currency ||
    !session.url
  )
    throw new DomainError("Payment session requires provider reconciliation.");
  await db.transaction(async (tx) => {
    await acquireTransactionLocks(tx, { orderIds: [orderId] });
    const [current] = await tx
      .select()
      .from(stripeCheckoutAttempts)
      .where(eq(stripeCheckoutAttempts.id, attempt.id))
      .for("update");
    if (current?.sessionId && current.sessionId !== session.id)
      throw new DomainError("Provider returned conflicting payment sessions.");
    if (!current?.sessionId)
      await tx
        .update(stripeCheckoutAttempts)
        .set({
          sessionId: session.id,
          checkoutUrl: session.url,
          paymentIntentId: session.payment_intent,
          status: "open",
          updatedAt: new Date(),
        })
        .where(eq(stripeCheckoutAttempts.id, attempt.id));
  });
  return { sessionId: session.id, url: session.url };
}

/** Signed events are durably accepted before network retrieval or settlement. */
export async function acceptStripeEvent(
  event: StripeEvent,
  adapter: StripeAdapter = stripeFromEnvironment(),
) {
  const expectedLive =
    process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ?? false;
  if (event.livemode !== expectedLive)
    throw new DomainError("Payment event mode does not match this deployment.");
  await db
    .insert(stripeWebhookInbox)
    .values({
      eventId: event.id,
      eventType: event.type,
      payload: event as unknown as Record<string, unknown>,
    })
    .onConflictDoNothing();
  const [inbox] = await db
    .select()
    .from(stripeWebhookInbox)
    .where(eq(stripeWebhookInbox.eventId, event.id));
  if (inbox?.status === "processed" || inbox?.status === "review")
    return { accepted: true, status: inbox.status };
  if (
    ![
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.expired",
    ].includes(event.type)
  ) {
    await db
      .update(stripeWebhookInbox)
      .set({ status: "processed", processedAt: new Date() })
      .where(eq(stripeWebhookInbox.eventId, event.id));
    return { accepted: true, status: "processed" };
  }
  const sessionId = event.data.object.id;
  if (typeof sessionId !== "string")
    throw new DomainError("Missing payment session identity.");
  const authoritative = await adapter.retrieveCheckoutSession(sessionId);
  return applyStripeEvent(event.id, authoritative);
}

export async function applyStripeEvent(
  eventId: string,
  session: StripeSession,
) {
  let [found] = await db
    .select()
    .from(stripeCheckoutAttempts)
    .where(eq(stripeCheckoutAttempts.sessionId, session.id));
  // A creation response can be lost after Stripe accepted the intent. Bind the
  // authoritative provider resource to the persisted unique order attempt.
  if (!found && session.metadata.orderId) {
    const orderId = parseActionUuid(session.metadata.orderId, "Provider order");
    const [candidate] = await db
      .select()
      .from(stripeCheckoutAttempts)
      .where(eq(stripeCheckoutAttempts.orderId, orderId));
    if (
      candidate &&
      !candidate.sessionId &&
      candidate.status === "creating" &&
      candidate.amountCents === session.amount_total &&
      candidate.currency === session.currency
    ) {
      await db.transaction(async (tx) => {
        await acquireTransactionLocks(tx, { orderIds: [orderId] });
        const [current] = await tx
          .select()
          .from(stripeCheckoutAttempts)
          .where(eq(stripeCheckoutAttempts.id, candidate.id))
          .for("update");
        if (!current?.sessionId && current?.status === "creating")
          await tx
            .update(stripeCheckoutAttempts)
            .set({
              sessionId: session.id,
              checkoutUrl: session.url,
              paymentIntentId: session.payment_intent,
              status: "open",
              updatedAt: new Date(),
            })
            .where(eq(stripeCheckoutAttempts.id, candidate.id));
      });
      [found] = await db
        .select()
        .from(stripeCheckoutAttempts)
        .where(eq(stripeCheckoutAttempts.sessionId, session.id));
    }
  }
  if (!found)
    throw new NotFoundError(
      "Payment session has not been linked yet; retry delivery.",
    );
  // Initialize the provider account outside financial transactions; its unique upsert
  // must not take a payment-account lock before confirmation's customer-credit locks.
  await db
    .insert(paymentAccounts)
    .values({
      accountIdentifier: "provider:stripe",
      accountName: "Card payment",
      accountType: "stripe",
      isActive: true,
    })
    .onConflictDoNothing();
  return db.transaction(async (tx) => {
    await acquireTransactionLocks(tx, { orderIds: [found.orderId] });
    const [attempt] = await tx
      .select()
      .from(stripeCheckoutAttempts)
      .where(eq(stripeCheckoutAttempts.id, found.id))
      .for("update");
    const [inbox] = await tx
      .select()
      .from(stripeWebhookInbox)
      .where(eq(stripeWebhookInbox.eventId, eventId))
      .for("update");
    if (!inbox) throw new NotFoundError("Payment event not accepted.");
    if (inbox.status !== "pending")
      return { accepted: true, status: inbox.status };
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, found.orderId));
    if (!order || !attempt) throw new NotFoundError("Payment order not found.");
    const review = async (reason: string) => {
      await tx
        .update(stripeCheckoutAttempts)
        .set({ status: "review", reviewReason: reason, updatedAt: new Date() })
        .where(eq(stripeCheckoutAttempts.id, attempt.id));
      await tx
        .update(stripeWebhookInbox)
        .set({
          status: "review",
          reviewReason: reason,
          processedAt: new Date(),
        })
        .where(eq(stripeWebhookInbox.eventId, eventId));
      await tx.insert(auditRecords).values({
        entityType: "order",
        entityId: order.id,
        actorId: providerActor,
        action: "payment.provider_review_required",
        reason,
      });
      return { accepted: true, status: "review" };
    };
    const terms = order.termsSnapshot as QuoteTerms;
    const unitIssue = stripeCurrencyIssue(
      terms.currency,
      terms.precision,
      attempt.amountCents,
    );
    if (
      unitIssue ||
      typeof terms.currency !== "string" ||
      terms.currency.toLowerCase() !== attempt.currency
    )
      return review(
        unitIssue || "Accepted order and provider currency units do not match.",
      );
    if (
      session.metadata.orderId !== order.id ||
      session.amount_total !== attempt.amountCents ||
      session.currency !== attempt.currency ||
      (attempt.paymentIntentId &&
        session.payment_intent !== attempt.paymentIntentId)
    )
      return review(
        "Provider session amount, currency or order identity mismatch.",
      );
    if (attempt.receiptId) {
      await tx
        .update(stripeWebhookInbox)
        .set({ status: "processed", processedAt: new Date() })
        .where(eq(stripeWebhookInbox.eventId, eventId));
      return { accepted: true, status: "processed" };
    }
    if (session.status === "expired" && session.payment_status === "unpaid") {
      if (
        order.lifecycleStatus === "unpaid" &&
        order.financialRevision === attempt.financialRevision &&
        order.purchaseTotalCents - order.creditAppliedCents ===
          attempt.amountCents
      )
        await expireProviderOrder(tx, order.id, providerActor);
      await tx
        .update(stripeCheckoutAttempts)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(stripeCheckoutAttempts.id, attempt.id));
      await tx
        .update(stripeWebhookInbox)
        .set({ status: "processed", processedAt: new Date() })
        .where(eq(stripeWebhookInbox.eventId, eventId));
      // Manual orders and uncertain/changed funding retain their obligations.
      return { accepted: true, status: "expired" };
    }
    if (
      session.status !== "complete" ||
      session.payment_status !== "paid" ||
      !session.payment_intent
    )
      return review("Session is not a settled payment.");
    if (
      order.lifecycleStatus !== "unpaid" ||
      order.financialRevision !== attempt.financialRevision ||
      order.purchaseTotalCents - order.creditAppliedCents !==
        attempt.amountCents
    )
      return review(
        "Order changed or closed while provider payment was outstanding.",
      );
    const receipts = await tx
      .select({ id: paymentReceipts.id })
      .from(paymentReceipts)
      .where(eq(paymentReceipts.orderId, order.id))
      .limit(1);
    if (receipts.length)
      return review("Another receipt arrived during provider checkout.");
    const [account] = await tx
      .select()
      .from(paymentAccounts)
      .where(eq(paymentAccounts.accountIdentifier, "provider:stripe"));
    if (!account!.isActive)
      return review("Stripe payment account was disabled before settlement.");
    const [receipt] = await tx
      .insert(paymentReceipts)
      .values({
        orderId: order.id,
        paymentAccountId: account!.id,
        amountCents: attempt.amountCents,
        rawReference: session.payment_intent,
        normalizedReference: session.payment_intent,
        recordedByUserId: providerActor,
      })
      .returning();
    await tx
      .update(orderProposals)
      .set({ status: "voided", resolvedAt: new Date() })
      .where(
        and(
          eq(orderProposals.orderId, order.id),
          eq(orderProposals.status, "pending"),
        ),
      );
    await confirmOrderInTransaction(tx, order.id, providerActor);
    await tx
      .update(stripeCheckoutAttempts)
      .set({
        status: "paid",
        receiptId: receipt!.id,
        paymentIntentId: session.payment_intent,
        updatedAt: new Date(),
      })
      .where(eq(stripeCheckoutAttempts.id, attempt.id));
    await tx
      .update(stripeWebhookInbox)
      .set({ status: "processed", processedAt: new Date() })
      .where(eq(stripeWebhookInbox.eventId, eventId));
    await tx.insert(auditRecords).values({
      entityType: "payment_receipt",
      entityId: receipt!.id,
      actorId: providerActor,
      action: "payment.stripe_settled",
      details: { eventId, sessionId: session.id },
    });
    return { accepted: true, status: "processed" };
  });
}

/** Backend worker recovery: inbox survives provider retries and process crashes. */
export async function reconcileStripeInbox(limit = 25) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET)
    return;
  const pending = await db
    .select()
    .from(stripeWebhookInbox)
    .where(eq(stripeWebhookInbox.status, "pending"))
    .orderBy(asc(stripeWebhookInbox.createdAt))
    .limit(Math.max(1, Math.min(100, limit)));
  for (const row of pending) {
    try {
      await acceptStripeEvent(row.payload as unknown as StripeEvent);
    } catch (error) {
      console.error("Stripe inbox reconciliation pending", {
        eventId: row.eventId,
        error,
      });
    }
  }
  // Recover lost completion/expiration webhooks from authoritative session data.
  const open = await db
    .select()
    .from(stripeCheckoutAttempts)
    .where(eq(stripeCheckoutAttempts.status, "open"))
    .orderBy(asc(stripeCheckoutAttempts.updatedAt))
    .limit(Math.max(1, Math.min(100, limit)));
  const adapter = stripeFromEnvironment();
  for (const attempt of open) {
    if (!attempt.sessionId) continue;
    try {
      const session = await adapter.retrieveCheckoutSession(attempt.sessionId);
      if (session.status === "complete" || session.status === "expired")
        await acceptStripeEvent(
          {
            id: `poll:${session.id}:${session.status}`,
            type:
              session.status === "expired"
                ? "checkout.session.expired"
                : "checkout.session.completed",
            livemode: process.env.STRIPE_SECRET_KEY!.startsWith("sk_live_"),
            data: { object: { id: session.id } },
          },
          adapter,
        );
      else
        await db
          .update(stripeCheckoutAttempts)
          .set({ updatedAt: new Date() })
          .where(eq(stripeCheckoutAttempts.id, attempt.id));
    } catch (error) {
      console.error("Stripe session reconciliation pending", {
        attemptId: attempt.id,
        error,
      });
    }
  }
}
