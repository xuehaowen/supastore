import { describe, it, expect, vi } from "vitest";
import type { EmailSender } from "@/application/ports/notifications";
import {
  adapterDefinition,
  adapterFingerprint,
  createAdapter,
  type AdapterRegistry,
  type ProfiledAdapterRegistry,
} from "@/infrastructure/adapter-registry";
import { notificationConfigFromEnvironment } from "@/infrastructure/notifications/provider-config";
import {
  smsAdapters,
  createSmsAdapter,
} from "@/infrastructure/notifications/sms-adapters";
import {
  phoneAdapters,
  createPhoneAdapter,
} from "@/infrastructure/notifications/phone-adapters";
import { paymentProviderFromEnvironment } from "@/infrastructure/payments/payment-adapters";
const uuid = "11111111-1111-4111-8111-111111111111";
describe("capability adapter registries", () => {
  it("delegates profile fencing to non-SMTP adapters without fingerprinting credentials", () => {
    type Config = { provider: "api-email"; apiKey: string; accountId: string };
    const registry = {
      "api-email": {
        handle: "api-email",
        parseEnvironment: () => ({
          provider: "api-email",
          apiKey: "fixture",
          accountId: "public-account",
        }),
        validateConfig: () => {},
        configurationFingerprint: (config) => config.accountId,
        create: () => ({
          identity: { provider: "api-email", profile: "fixture" },
          capabilities: { deliveryTracking: true },
          send: vi.fn(),
        }),
      },
    } satisfies ProfiledAdapterRegistry<Config, EmailSender, undefined>;
    const config = registry["api-email"].parseEnvironment();
    expect(
      adapterFingerprint<Config, EmailSender, undefined>(registry, config),
    ).toBe("public-account");
    expect(
      adapterFingerprint<Config, EmailSender, undefined>(registry, {
        ...config,
        apiKey: "rotated-secret",
      }),
    ).toBe("public-account");
    expect(
      adapterFingerprint<Config, EmailSender, undefined>(registry, {
        ...config,
        accountId: "another-account",
      }),
    ).not.toBe("public-account");
  });
  it("supports an API email sender without inheriting the SMTP implementation", async () => {
    type Config = { provider: "api-email"; apiKey: string };
    const send = vi
      .fn()
      .mockResolvedValue({ status: "accepted", providerMessageId: "fixture" });
    const registry = {
      "api-email": {
        handle: "api-email",
        parseEnvironment: () => ({ provider: "api-email", apiKey: "fixture" }),
        validateConfig: (config) => {
          if (!config.apiKey) throw new Error("Missing API key");
        },
        create: () => ({
          identity: { provider: "api-email", profile: "fixture" },
          capabilities: { deliveryTracking: true },
          send,
        }),
      },
    } satisfies AdapterRegistry<Config, EmailSender, undefined>;
    const entry = adapterDefinition<Config, EmailSender, undefined>(
      registry,
      "api-email",
      "EMAIL_PROVIDER",
    );
    const sender = createAdapter<Config, EmailSender, undefined>(
      registry,
      entry.parseEnvironment({}),
      undefined,
    );
    await sender.send({
      deliveryId: "fixture",
      to: "buyer@example.test",
      subject: "Order",
      text: "Fixture",
    });
    expect(send).toHaveBeenCalledOnce();
    expect(() =>
      createAdapter<Config, EmailSender, undefined>(
        registry,
        { provider: "api-email", apiKey: "" },
        undefined,
      ),
    ).toThrow("Missing API key");
    expect(send).toHaveBeenCalledOnce();
  });
  it.each(["unknown", "__proto__", "constructor"])(
    "rejects unknown or inherited handles %s",
    (handle) => {
      expect(() =>
        notificationConfigFromEnvironment({ EMAIL_PROVIDER: handle }),
      ).toThrow("EMAIL_PROVIDER");
      expect(() =>
        notificationConfigFromEnvironment({ SMS_PROVIDER: handle }),
      ).toThrow("SMS_PROVIDER");
      expect(() =>
        notificationConfigFromEnvironment({
          PHONE_VERIFICATION_PROVIDER: handle,
        }),
      ).toThrow("PHONE_VERIFICATION_PROVIDER");
      expect(() => paymentProviderFromEnvironment(handle, {})).toThrow(
        "payment provider",
      );
    },
  );
  it("keeps SMS and verification distinct with stable existing identities and injected dependencies", () => {
    const env = {
      TELNYX_API_KEY: "fixture",
      TELNYX_FROM: "+15555550123",
      TELNYX_MESSAGING_PROFILE_ID: uuid,
      TELNYX_VERIFY_PROFILE_ID: uuid,
    };
    const dependencies = {
      fetcher: vi.fn<typeof fetch>(),
      authorizeSms: () => false,
    };
    const sms = createSmsAdapter(
      smsAdapters.telnyx.parseEnvironment(env),
      dependencies,
    );
    const phone = createPhoneAdapter(
      phoneAdapters.telnyx.parseEnvironment(env),
      dependencies,
    );
    expect(sms.identity.provider).toBe("telnyx");
    expect(phone.identity.provider).toBe("telnyx-verify");
    expect(dependencies.fetcher).not.toHaveBeenCalled();
    expect(
      notificationConfigFromEnvironment({
        EMAIL_PROVIDER: "disabled",
        SMS_PROVIDER: "disabled",
        PHONE_VERIFICATION_PROVIDER: "disabled",
      }),
    ).toEqual({});
  });
  it("normalizes authoritative Stripe responses through the payment port without changing money or retry keys", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        id: "cs_test_fixture",
        url: "https://checkout.stripe.com/c/pay/fixture",
        status: "complete",
        payment_status: "paid",
        payment_intent: "pi_fixture",
        amount_total: 1234,
        currency: "usd",
        metadata: { orderId: "order-1" },
      }),
    );
    const provider = paymentProviderFromEnvironment(
      "stripe",
      {
        STRIPE_SECRET_KEY: "sk_test_fixture",
        STOREFRONT_ORIGIN: "https://shop.example",
      },
      { fetcher },
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(provider.provider).toBe("stripe");
    const result = await provider.createCheckoutSession({
      orderId: "order-1",
      amountCents: 1234,
      currency: "USD",
      successUrl: "https://shop.example/success",
      cancelUrl: "https://shop.example/cancel",
      idempotencyKey: "original-request",
    });
    expect(result).toMatchObject({
      paymentId: "pi_fixture",
      amountCents: 1234,
      paymentStatus: "paid",
    });
    expect(result).not.toHaveProperty("payment_intent");
    expect(
      new Headers(fetcher.mock.calls[0]![1]!.headers).get("Idempotency-Key"),
    ).toBe("original-request");
    expect(() => paymentProviderFromEnvironment("stripe", {})).toThrow(
      "Stripe secret key",
    );
  });
});
