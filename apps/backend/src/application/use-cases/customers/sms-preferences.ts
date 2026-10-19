import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  smsPreferences,
  smsConsentEvents,
  storeSettings,
} from "@/infrastructure/db/schema";
import {
  smsReadiness,
  smsDisclosure,
  SMS_CONSENT_VERSION,
} from "@supastore/contracts";
import { verifiedCustomer } from "./customer-ownership";
import { DomainError } from "@/application/common/errors";
import { validSmsPhone } from "@/application/notifications/sms-policy";
import type { PhoneVerifier } from "@/application/ports/notifications";
import type { Transaction } from "@/application/common/transaction";
import { logFailure } from "@/infrastructure/http/failure";
export const cancelPhoneVerification = {
  optedIn: false,
  verifiedAt: null,
  consentAt: null,
  verificationSid: null,
  requestNonce: null,
};
export async function applyPhoneOptOut(tx: Transaction, phone: string) {
  const preferences = await tx
    .select()
    .from(smsPreferences)
    .where(eq(smsPreferences.phone, phone))
    .for("update");
  for (const preference of preferences)
    await tx.insert(smsConsentEvents).values({
      preferenceId: preference.id,
      phone,
      action: "withdrawn",
      source: "keyword:STOP",
      wording: "STOP",
      version: SMS_CONSENT_VERSION,
    });
  await tx
    .update(smsPreferences)
    .set({ ...cancelPhoneVerification, updatedAt: new Date() })
    .where(eq(smsPreferences.phone, phone));
}
export async function customerSms(userId: string, enabled = false) {
  return db.transaction(async (tx) => {
    const customer = await verifiedCustomer(tx, userId);
    const [preference] = await tx
      .select()
      .from(smsPreferences)
      .where(eq(smsPreferences.customerId, customer.id));
    return {
      enabled,
      phone: preference?.phone || "",
      optedIn: preference?.optedIn || false,
      verified: Boolean(preference?.verifiedAt),
    };
  });
}
export async function updateCustomerSms(
  userId: string | null,
  input: {
    operation: string;
    phone?: string;
    code?: string;
    locale?: string;
    consent?: boolean;
    preferenceId?: string;
    source?: "checkout" | "sms-page";
    disclosure?: string;
  },
  verifier?: PhoneVerifier,
  enabled = false,
) {
  if (input.operation === "disable") {
    if (!userId)
      throw new DomainError("Sign in to change account preferences.");
    await db.transaction(async (tx) => {
      const customer = await verifiedCustomer(tx, userId);
      const [preference] = await tx
        .select()
        .from(smsPreferences)
        .where(eq(smsPreferences.customerId, customer.id))
        .for("update");
      if (preference)
        await tx.insert(smsConsentEvents).values({
          preferenceId: preference.id,
          phone: preference.phone,
          action: "withdrawn",
          source: "account",
          wording: "Disable SMS",
          version: SMS_CONSENT_VERSION,
        });
      await tx
        .update(smsPreferences)
        .set({ ...cancelPhoneVerification, updatedAt: new Date() })
        .where(eq(smsPreferences.customerId, customer.id));
    });
    return;
  }
  if (!enabled || !verifier)
    throw new DomainError("SMS is not enabled by this store.");
  if (!["start", "confirm"].includes(input.operation))
    throw new DomainError("Invalid SMS operation.");
  const { provider, profile } = verifier.identity;
  if (!provider || !profile)
    throw new DomainError("Phone verification provider is unavailable.");
  const claim = await db.transaction(async (tx) => {
    const customer = userId ? await verifiedCustomer(tx, userId) : null;
    const [store] = await tx.select().from(storeSettings).limit(1);
    if (!smsReadiness(store).enabled)
      throw new DomainError(
        "SMS setup is incomplete or disabled by this store.",
      );
    const now = new Date();
    const publicId =
      input.operation === "start" ? randomUUID() : input.preferenceId;
    let phoneBlocked: string | null = null;
    if (!customer && !publicId)
      throw new DomainError("Request a new verification code.");
    if (input.operation === "start") {
      if (!input.consent || !validSmsPhone(input.phone || ""))
        throw new DomainError(
          "Consent and an international phone number are required.",
        );
      if (!customer && input.disclosure !== smsDisclosure(store!, input.locale))
        throw new DomainError(
          "SMS terms changed. Reload the page before subscribing.",
        );
      // Serialize across accounts and public requests for the same destination.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${"sms:" + input.phone}, 0))`,
      );
      const [requests] = await tx
        .select({
          count: sql<number>`count(*)::int`,
          latest: sql<Date | null>`max(${smsConsentEvents.createdAt})`,
        })
        .from(smsConsentEvents)
        .where(
          and(
            eq(smsConsentEvents.phone, input.phone!),
            eq(smsConsentEvents.action, "requested"),
            sql`${smsConsentEvents.createdAt} > now() - interval '1 hour'`,
          ),
        );
      phoneBlocked =
        (requests?.count || 0) >= 5
          ? "Too many verification requests. Retry in one hour."
          : requests?.latest &&
              now.getTime() - new Date(requests.latest).getTime() < 60000
            ? "Wait one minute before requesting another code."
            : null;
    }
    if (!customer && phoneBlocked) return { error: phoneBlocked };
    if (customer || input.operation === "start")
      await tx
        .insert(smsPreferences)
        .values({
          ...(customer ? { customerId: customer.id } : { id: publicId! }),
          phone: "",
          requestedAt: new Date(0),
        })
        .onConflictDoNothing();
    const preferenceOwner = customer
      ? eq(smsPreferences.customerId, customer.id)
      : and(
          eq(smsPreferences.id, publicId!),
          sql`${smsPreferences.customerId} is null`,
        );
    const [preference] = await tx
      .select()
      .from(smsPreferences)
      .where(preferenceOwner)
      .for("update");
    if (!preference) throw new DomainError("SMS preference unavailable.");
    if (input.operation === "start") {
      const sameWindow =
        preference.requestWindowAt &&
        now.getTime() - preference.requestWindowAt.getTime() < 3600000;
      const count = sameWindow ? preference.requestWindowCount : 0;
      const blocked =
        phoneBlocked ||
        (now.getTime() - preference.requestedAt.getTime() < 60000
          ? "Wait one minute before requesting another code."
          : count >= 5
            ? "Too many verification requests. Retry in one hour."
            : null);
      if (blocked) {
        if (preference.phone !== input.phone)
          await tx
            .update(smsPreferences)
            .set({
              ...cancelPhoneVerification,
              phone: input.phone!,
              updatedAt: now,
            })
            .where(eq(smsPreferences.id, preference.id));
        return { error: blocked };
      }
      const nonce = randomUUID();
      await tx
        .update(smsPreferences)
        .set({
          phone: input.phone!,
          locale: input.locale === "zh" ? "zh" : "en",
          timezone: store?.timezone || "UTC",
          requestedAt: now,
          requestNonce: nonce,
          verificationProvider: provider,
          verificationProfile: profile,
          requestWindowAt: sameWindow ? preference.requestWindowAt : now,
          requestWindowCount: count + 1,
          attempts: 0,
          verificationSid: null,
          verifiedAt: null,
          consentAt: now,
          consentText: smsDisclosure(store!, input.locale),
          consentVersion: SMS_CONSENT_VERSION,
          optedIn: false,
          updatedAt: now,
        })
        .where(eq(smsPreferences.id, preference.id));
      await tx.insert(smsConsentEvents).values({
        preferenceId: preference.id,
        phone: input.phone!,
        action: "requested",
        source: customer ? "account" : input.source || "sms-page",
        wording: smsDisclosure(store!, input.locale),
        version: SMS_CONSENT_VERSION,
      });
      return {
        preferenceId: preference.id,
        phone: input.phone!,
        nonce,
        sid: "",
        provider,
        profile,
      };
    }
    if (
      !/^\d{4,10}$/.test(input.code || "") ||
      !preference.verificationSid ||
      !preference.requestNonce ||
      !preference.consentAt ||
      now.getTime() - preference.requestedAt.getTime() > 600000 ||
      preference.attempts >= 5
    )
      throw new DomainError("Request a new verification code.");
    if (
      preference.verificationProvider !== provider ||
      preference.verificationProfile !== profile
    )
      throw new DomainError(
        "Verification provider changed. Request a new code.",
      );
    await tx
      .update(smsPreferences)
      .set({ attempts: preference.attempts + 1 })
      .where(eq(smsPreferences.id, preference.id));
    return {
      preferenceId: preference.id,
      phone: preference.phone,
      nonce: preference.requestNonce,
      sid: preference.verificationSid,
      provider,
      profile,
    };
  });
  if ("error" in claim) throw new DomainError(claim.error);
  const claimMatches = and(
    eq(smsPreferences.id, claim.preferenceId),
    eq(smsPreferences.phone, claim.phone),
    eq(smsPreferences.requestNonce, claim.nonce),
    eq(smsPreferences.verificationProvider, claim.provider),
    eq(smsPreferences.verificationProfile, claim.profile),
  );
  let verificationId = "";
  let unavailable = false;
  let expired = false;
  let invalid = false;
  try {
    if (input.operation === "start") {
      const result = await verifier.start({
        phone: claim.phone,
        locale: input.locale === "zh" ? "zh" : "en",
      });
      if (
        result.status !== "pending" ||
        !result.verificationId ||
        result.verificationId.length > 200
      )
        unavailable = true;
      else verificationId = result.verificationId;
    } else {
      const result = await verifier.check({
        verificationId: claim.sid,
        code: input.code!,
      });
      unavailable = !["approved", "invalid", "expired"].includes(result);
      expired = result === "expired";
      invalid = result === "invalid";
    }
  } catch (error) {
    logFailure(error, "sms.verification", { preferenceId: claim.preferenceId });
    unavailable = true;
  }
  if (unavailable) {
    // Reserve attempts before I/O to bound parallel guesses, refund only provider outages.
    if (input.operation === "confirm")
      await db
        .update(smsPreferences)
        .set({ attempts: sql`greatest(0, ${smsPreferences.attempts} - 1)` })
        .where(claimMatches);
    throw new DomainError(
      "Phone verification is temporarily unavailable. Please retry shortly.",
      "DEPENDENCY_UNAVAILABLE",
    );
  }
  if (expired) {
    await db
      .update(smsPreferences)
      .set({ verificationSid: null, requestNonce: null })
      .where(claimMatches);
    throw new DomainError(
      "Verification code expired. Request a new verification code.",
    );
  }
  if (invalid)
    throw new DomainError("Verification code is invalid. Please try again.");
  const saved = await db.transaction(async (tx) => {
    // The lock makes activation and its immutable audit event atomic with STOP.
    await tx
      .select({ id: smsPreferences.id })
      .from(smsPreferences)
      .where(eq(smsPreferences.id, claim.preferenceId))
      .for("update");
    const saved = await tx
      .update(smsPreferences)
      .set(
        input.operation === "start"
          ? { verificationSid: verificationId, updatedAt: new Date() }
          : {
              verifiedAt: new Date(),
              optedIn: true,
              requestNonce: null,
              verificationSid: null,
              updatedAt: new Date(),
            },
      )
      .where(
        and(
          eq(smsPreferences.id, claim.preferenceId),
          eq(smsPreferences.phone, claim.phone),
          eq(smsPreferences.requestNonce, claim.nonce),
          eq(smsPreferences.verificationProvider, claim.provider),
          eq(smsPreferences.verificationProfile, claim.profile),
        ),
      )
      .returning({ id: smsPreferences.id });
    if (saved.length && input.operation === "confirm") {
      const [request] = await tx
        .select()
        .from(smsConsentEvents)
        .where(
          and(
            eq(smsConsentEvents.preferenceId, claim.preferenceId),
            eq(smsConsentEvents.action, "requested"),
          ),
        )
        .orderBy(sql`${smsConsentEvents.createdAt} desc`)
        .limit(1);
      if (request)
        await tx.insert(smsConsentEvents).values({
          preferenceId: claim.preferenceId,
          phone: claim.phone,
          action: "verified",
          source: request.source,
          wording: request.wording,
          version: request.version,
        });
    }
    return saved;
  });
  if (!saved.length)
    throw new DomainError(
      "Verification request changed or consent was withdrawn. Request a new code.",
    );
  return {
    preferenceId: claim.preferenceId,
    verified: input.operation === "confirm",
  };
}
