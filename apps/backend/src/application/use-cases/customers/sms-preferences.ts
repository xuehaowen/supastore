import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import { smsPreferences, storeSettings } from "@/infrastructure/db/schema";
import { verifiedCustomer } from "./customer-ownership";
import { DomainError } from "@/application/common/errors";
import { validSmsPhone } from "@/application/notifications/sms-policy";
import type { PhoneVerifier } from "@/application/ports/notifications";
import type { Transaction } from "@/application/common/transaction";
export const cancelPhoneVerification = {
  optedIn: false,
  verifiedAt: null,
  consentAt: null,
  verificationSid: null,
  requestNonce: null,
};
export async function applyPhoneOptOut(tx: Transaction, phone: string) {
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
  userId: string,
  input: {
    operation: string;
    phone?: string;
    code?: string;
    locale?: string;
    consent?: boolean;
  },
  verifier?: PhoneVerifier,
  enabled = false,
) {
  if (input.operation === "disable") {
    await db.transaction(async (tx) => {
      const customer = await verifiedCustomer(tx, userId);
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
    const customer = await verifiedCustomer(tx, userId);
    const [store] = await tx.select().from(storeSettings).limit(1);
    const now = new Date();
    await tx
      .insert(smsPreferences)
      .values({ customerId: customer.id, phone: "", requestedAt: new Date(0) })
      .onConflictDoNothing();
    const [preference] = await tx
      .select()
      .from(smsPreferences)
      .where(eq(smsPreferences.customerId, customer.id))
      .for("update");
    if (!preference) throw new DomainError("SMS preference unavailable.");
    if (input.operation === "start") {
      if (!input.consent || !validSmsPhone(input.phone || ""))
        throw new DomainError(
          "Consent and an international phone number are required.",
        );
      const sameWindow =
        preference.requestWindowAt &&
        now.getTime() - preference.requestWindowAt.getTime() < 3600000;
      const count = sameWindow ? preference.requestWindowCount : 0;
      const blocked =
        now.getTime() - preference.requestedAt.getTime() < 60000
          ? "Wait one minute before requesting another code."
          : count >= 5
            ? "Too many verification requests. Retry in one hour."
            : null;
      if (blocked) {
        if (preference.phone !== input.phone)
          await tx
            .update(smsPreferences)
            .set({
              ...cancelPhoneVerification,
              phone: input.phone!,
              updatedAt: now,
            })
            .where(eq(smsPreferences.customerId, customer.id));
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
          optedIn: false,
          updatedAt: now,
        })
        .where(eq(smsPreferences.customerId, customer.id));
      return {
        customerId: customer.id,
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
      .where(eq(smsPreferences.customerId, customer.id));
    return {
      customerId: customer.id,
      phone: preference.phone,
      nonce: preference.requestNonce,
      sid: preference.verificationSid,
      provider,
      profile,
    };
  });
  if ("error" in claim) throw new DomainError(claim.error);
  let verificationId = "";
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
        throw new Error("Verification unavailable.");
      verificationId = result.verificationId;
    } else {
      const result = await verifier.check({
        verificationId: claim.sid,
        code: input.code!,
      });
      if (result !== "approved")
        throw new Error("Invalid verification result.");
    }
  } catch {
    throw new DomainError(
      "Phone verification is unavailable or the code is invalid. Please retry.",
    );
  }
  const saved = await db
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
        eq(smsPreferences.customerId, claim.customerId),
        eq(smsPreferences.phone, claim.phone),
        eq(smsPreferences.requestNonce, claim.nonce),
        eq(smsPreferences.verificationProvider, claim.provider),
        eq(smsPreferences.verificationProfile, claim.profile),
      ),
    )
    .returning({ customerId: smsPreferences.customerId });
  if (!saved.length)
    throw new DomainError(
      "Verification request changed or consent was withdrawn. Request a new code.",
    );
}
