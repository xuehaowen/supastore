import { afterEach, describe, expect, it, vi } from "vitest";
const smtp = vi.hoisted(() => ({
  sendMail: vi.fn(),
  close: vi.fn(),
  createTransport: vi.fn(),
}));
vi.mock("nodemailer", () => ({
  default: { createTransport: smtp.createTransport },
}));
import {
  NodemailerEmailSender,
  type EmailTransportFactory,
} from "@/infrastructure/notifications/nodemailer-email";
import { TelnyxSmsSender } from "@/infrastructure/notifications/telnyx-sms";
import { TelnyxPhoneVerifier } from "@/infrastructure/notifications/telnyx-phone-verifier";
import {
  FakeEmailSender,
  FakeSmsSender,
} from "@/infrastructure/notifications/fake-senders";
import {
  createNotificationProviders,
  getNotificationProviders,
  closeNotificationProviders,
} from "@/infrastructure/bootstrap/notification-providers";
import {
  nodemailerIdentity,
  telnyxSmsIdentity,
  notificationConfigFromEnvironment,
  type NodemailerConfig,
  type TelnyxSmsConfig,
  type TelnyxPhoneConfig,
} from "@/infrastructure/notifications/provider-config";
const id = "11111111-1111-4111-8111-111111111111";
const zhId = "22222222-2222-4222-8222-222222222222";
const messageId = "33333333-3333-4333-8333-333333333333";
const emailConfig: NodemailerConfig = {
  provider: "nodemailer",
  host: "smtp.example.test",
  port: 587,
  secure: false,
  from: "Store <sender@example.test>",
  user: "sender",
  password: "private-password",
};
const smsConfig: TelnyxSmsConfig = {
  provider: "telnyx",
  apiKey: "private-api-key",
  from: "+15555550123",
  messagingProfileId: id,
};
const phoneConfig: TelnyxPhoneConfig = {
  provider: "telnyx",
  apiKey: "private-api-key",
  verifyProfileId: id,
  verifyProfileIdZh: zhId,
};
const email = {
  deliveryId: id,
  to: "buyer@example.test",
  subject: "Order confirmed",
  text: "Fixture order",
  html: "<p>Fixture order</p>",
};
afterEach(async () => {
  await closeNotificationProviders();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it("global outbound suspension prevents even lazy transport construction", () => {
  vi.stubEnv("DISABLE_OUTBOUND_DELIVERY", "true");
  vi.stubEnv("EMAIL_PROVIDER", "nodemailer");
  vi.stubEnv("SMTP_HOST", undefined);
  expect(getNotificationProviders()).toEqual({});
  expect(smtp.createTransport).not.toHaveBeenCalled();
});
describe("Nodemailer transport", () => {
  it("reuses one constrained pool, preserves rendered content and assigns a stable non-idempotent Message-ID", async () => {
    const sendMail = vi.fn().mockResolvedValue({ accepted: [email.to] });
    const close = vi.fn();
    const factory = vi.fn<EmailTransportFactory>(() => ({ sendMail, close }));
    const sender = new NodemailerEmailSender(emailConfig, factory);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory.mock.calls[0]![0]).toMatchObject({
      pool: true,
      maxConnections: 1,
      requireTLS: true,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    const first = await sender.send(email);
    await sender.send(email);
    expect(sendMail.mock.calls[0]![0]).toMatchObject({
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
    expect(sendMail.mock.calls[0]![0].messageId).toBe(
      sendMail.mock.calls[1]![0].messageId,
    );
    expect(first.status).toBe("accepted");
    expect(sender.capabilities).not.toHaveProperty("idempotencyWindowMs");
    sender.close();
    sender.close();
    expect(close).toHaveBeenCalledTimes(1);
    expect((await sender.send(email)).status).toBe("rejected");
  });
  it.each([
    [450, true],
    [550, false],
  ])(
    "classifies definite SMTP %i responses without exposing server detail",
    async (responseCode, retryable) => {
      const sender = new NodemailerEmailSender(emailConfig, () => ({
        sendMail: vi.fn().mockRejectedValue({
          responseCode,
          message: "private credential/recipient detail",
        }),
        close: vi.fn(),
      }));
      expect(await sender.send(email)).toEqual({
        status: "rejected",
        code: `SMTP_${responseCode}`,
        retryable,
      });
    },
  );
  it("retains post-submission timeouts as unknown and rejects invalid recipients without IO", async () => {
    const sendMail = vi
      .fn()
      .mockRejectedValue({ code: "ETIMEDOUT", command: "DATA" });
    const sender = new NodemailerEmailSender(emailConfig, () => ({
      sendMail,
      close: vi.fn(),
    }));
    expect((await sender.send(email)).status).toBe("unknown");
    expect(
      (
        await sender.send({
          ...email,
          to: "victim@example.test\r\nBcc:other@example.test",
        })
      ).status,
    ).toBe("rejected");
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
  it("allows loopback fixture SMTP without STARTTLS while defaulting remote SMTP to required TLS", () => {
    const factory = vi.fn<EmailTransportFactory>(() => ({
      sendMail: vi.fn(),
      close: vi.fn(),
    }));
    const sender = new NodemailerEmailSender(
      { ...emailConfig, host: "127.0.0.1", port: 25259 },
      factory,
    );
    expect(factory.mock.calls[0]![0]).toHaveProperty("requireTLS", false);
    sender.close();
    expect(
      notificationConfigFromEnvironment({
        EMAIL_PROVIDER: "nodemailer",
        SMTP_HOST: "localhost",
        SMTP_FROM: "sender@example.test",
        SMTP_REQUIRE_TLS: "true",
      }).email?.requireTls,
    ).toBe(true);
  });
  it("bounds the pending queue and total submission time without claiming timeout means rejection", async () => {
    vi.useFakeTimers();
    const sendMail = vi.fn(() => new Promise<never>(() => {}));
    const close = vi.fn();
    const sender = new NodemailerEmailSender(emailConfig, () => ({
      sendMail,
      close,
    }));
    const pending = Array.from({ length: 8 }, () => sender.send(email));
    expect(await sender.send(email)).toMatchObject({
      status: "rejected",
      code: "SMTP_QUEUE_FULL",
      retryable: true,
    });
    expect(sendMail).toHaveBeenCalledTimes(8);
    await vi.advanceTimersByTimeAsync(30001);
    expect(await Promise.all(pending)).toEqual(
      Array.from({ length: 8 }, () => ({
        status: "unknown",
        code: "SMTP_DEADLINE_UNKNOWN",
      })),
    );
    expect(close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(await sender.send(email)).toMatchObject({
      status: "rejected",
      code: "SMTP_CIRCUIT_OPEN",
      retryable: true,
    });
  });
  it("rebuilds one pool after cooldown for new deliveries without replaying an ambiguous original", async () => {
    vi.useFakeTimers();
    let finishOriginal: ((result: { accepted: string[] }) => void) | undefined;
    const oldMail = vi.fn(
      () =>
        new Promise<{ accepted: string[] }>((resolve) => {
          finishOriginal = resolve;
        }),
    );
    const oldClose = vi.fn();
    const freshMail = vi.fn().mockResolvedValue({ accepted: [email.to] });
    const freshClose = vi.fn();
    const factory = vi
      .fn<EmailTransportFactory>()
      .mockReturnValueOnce({ sendMail: oldMail, close: oldClose })
      .mockReturnValue({ sendMail: freshMail, close: freshClose });
    const sender = new NodemailerEmailSender(emailConfig, factory);
    const original = sender.send(email);
    await vi.advanceTimersByTimeAsync(30000);
    expect(await original).toEqual({
      status: "unknown",
      code: "SMTP_DEADLINE_UNKNOWN",
    });
    expect(oldClose).toHaveBeenCalledTimes(1);
    expect(await sender.send({ ...email, deliveryId: zhId })).toMatchObject({
      status: "rejected",
      code: "SMTP_CIRCUIT_OPEN",
      retryAfterMs: 30000,
    });
    await vi.advanceTimersByTimeAsync(30000);
    expect(factory).toHaveBeenCalledTimes(1); // No timer-driven replay or eager background reconnect.
    const results = await Promise.all([
      sender.send({ ...email, deliveryId: zhId }),
      sender.send({ ...email, deliveryId: messageId }),
    ]);
    expect(results.map((result) => result.status)).toEqual([
      "accepted",
      "accepted",
    ]);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(oldMail).toHaveBeenCalledTimes(1);
    expect(freshMail).toHaveBeenCalledTimes(2);
    finishOriginal!({ accepted: [email.to] }); // A stale late result must not close the fresh generation.
    await vi.advanceTimersByTimeAsync(30001);
    expect(freshClose).not.toHaveBeenCalled();
    expect(await original).toEqual({
      status: "unknown",
      code: "SMTP_DEADLINE_UNKNOWN",
    });
    sender.close();
    sender.close();
    expect(oldClose).toHaveBeenCalledTimes(1);
    expect(freshClose).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
describe("Telnyx adapters", () => {
  it("sends SMS only through explicit authorization, without invented replay headers", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ data: { id: messageId, messaging_profile_id: id } }),
      );
    const disabled = new TelnyxSmsSender(smsConfig, { fetcher });
    expect(
      (
        await disabled.send({
          deliveryId: id,
          to: "+15555550124",
          text: "Fixture",
        })
      ).status,
    ).toBe("rejected");
    expect(fetcher).not.toHaveBeenCalled();
    const sender = new TelnyxSmsSender(smsConfig, {
      fetcher,
      authorizeSms: () => true,
    });
    expect(
      await sender.send({
        deliveryId: id,
        to: "+15555550124",
        text: "中文 fixture",
      }),
    ).toEqual({ status: "accepted", providerMessageId: messageId });
    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.telnyx.com/v2/messages");
    expect(JSON.parse(String(options!.body))).toMatchObject({
      messaging_profile_id: id,
      type: "SMS",
      text: "中文 fixture",
    });
    expect(new Headers(options!.headers).get("Idempotency-Key")).toBeNull();
    expect(options!.redirect).toBe("error");
    expect(sender.capabilities).not.toHaveProperty("idempotencyWindowMs");
    expect(JSON.stringify(sender)).not.toContain("private-api-key");
  });
  it("distinguishes rate/validation rejection from timeout, 5xx and malformed acceptance", async () => {
    for (const [response, status] of [
      [
        new Response("", { status: 429, headers: { "Retry-After": "60" } }),
        "rejected",
      ],
      [new Response("", { status: 422 }), "rejected"],
      [new Response("", { status: 500 }), "unknown"],
      [Response.json({ data: {} }), "unknown"],
    ] as const) {
      const sender = new TelnyxSmsSender(smsConfig, {
        fetcher: vi.fn<typeof fetch>().mockResolvedValue(response),
        authorizeSms: () => true,
      });
      expect(
        (
          await sender.send({
            deliveryId: id,
            to: "+15555550124",
            text: "Fixture",
          })
        ).status,
      ).toBe(status);
    }
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("private URL/key"));
    const sender = new TelnyxSmsSender(smsConfig, {
      fetcher,
      authorizeSms: () => true,
    });
    expect(
      await sender.send({
        deliveryId: id,
        to: "+15555550124",
        text: "Fixture",
      }),
    ).toEqual({ status: "unknown", code: "TELNYX_SUBMISSION_UNKNOWN" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("starts profile-bound verification, selects configured Chinese profile and checks only provider response codes", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          data: { id: messageId, status: "pending", verify_profile_id: zhId },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ data: { response_code: "accepted" } }),
      )
      .mockResolvedValueOnce(
        Response.json({ data: { response_code: "rejected" } }),
      )
      .mockResolvedValueOnce(
        Response.json({ data: { response_code: "expired" } }),
      )
      .mockResolvedValueOnce(Response.json({ data: { status: "accepted" } }));
    const verifier = new TelnyxPhoneVerifier(phoneConfig, {
      fetcher,
      authorizeSms: () => true,
    });
    expect(
      await verifier.start({ phone: "+15555550124", locale: "zh" }),
    ).toEqual({ status: "pending", verificationId: messageId });
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]!.body))).toEqual({
      phone_number: "+15555550124",
      verify_profile_id: zhId,
    });
    expect(
      await verifier.check({ verificationId: messageId, code: "12345" }),
    ).toBe("approved");
    expect(
      await verifier.check({ verificationId: messageId, code: "12345" }),
    ).toBe("invalid");
    expect(
      await verifier.check({ verificationId: messageId, code: "12345" }),
    ).toBe("expired");
    expect(
      await verifier.check({ verificationId: messageId, code: "12345" }),
    ).toBe("unavailable");
    expect(JSON.parse(String(fetcher.mock.calls[1]![1]!.body))).toEqual({
      code: "12345",
    });
    expect(
      await verifier.check({ verificationId: "../messages", code: "12345" }),
    ).toBe("invalid");
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
});
describe("notification provider bootstrap", () => {
  it("fails closed instead of selecting fake providers and leaves SMS unactivated", () => {
    expect(() =>
      notificationConfigFromEnvironment({ EMAIL_PROVIDER: "fake" }),
    ).toThrow("EMAIL_PROVIDER");
    expect(
      createNotificationProviders({ sms: smsConfig, phone: phoneConfig }),
    ).toEqual({});
    const enabled = createNotificationProviders(
      { sms: smsConfig, phone: phoneConfig },
      { authorizeSms: () => true, fetcher: vi.fn<typeof fetch>() },
    );
    expect(enabled.sms?.identity.provider).toBe("telnyx");
    expect(enabled.phone?.identity.provider).toBe("telnyx-verify");
    expect(notificationConfigFromEnvironment({})).toEqual({});
  });
  it("pins singleton profiles, allows credential rotation without altering identity and closes the pool once", async () => {
    smtp.createTransport.mockReturnValue({
      sendMail: smtp.sendMail,
      close: smtp.close,
    });
    for (const [name, value] of Object.entries({
      EMAIL_PROVIDER: "nodemailer",
      SMTP_HOST: "smtp.example.test",
      SMTP_PORT: "587",
      SMTP_SECURE: "false",
      SMTP_FROM: "sender@example.test",
      SMTP_USER: "sender",
      SMTP_PASSWORD: "first-secret",
      SMS_PROVIDER: "disabled",
      PHONE_VERIFICATION_PROVIDER: "disabled",
    }))
      vi.stubEnv(name, value);
    const first = getNotificationProviders();
    vi.stubEnv("SMTP_PASSWORD", "rotated-secret");
    expect(getNotificationProviders()).toBe(first);
    expect(smtp.createTransport).toHaveBeenCalledTimes(1);
    vi.stubEnv("SMTP_FROM", "different@example.test");
    expect(() => getNotificationProviders()).toThrow("restart required");
    await closeNotificationProviders();
    expect(smtp.close).toHaveBeenCalledTimes(1);
    expect(getNotificationProviders().email!.identity.profile).not.toBe(
      first.email!.identity.profile,
    );
  });
  it("derives nonsecret stable webhook identities and provides explicit test senders", async () => {
    expect(nodemailerIdentity(emailConfig)).toEqual(
      nodemailerIdentity({ ...emailConfig, password: "rotated" }),
    );
    expect(telnyxSmsIdentity(id, smsConfig.from)).toEqual(
      new TelnyxSmsSender({ ...smsConfig, apiKey: "rotated" }).identity,
    );
    const sender = new FakeEmailSender();
    const a = await sender.send(email);
    const b = await sender.send({ ...email, deliveryId: zhId });
    expect(a).not.toEqual(b);
    expect(
      (
        await new FakeSmsSender().send({
          deliveryId: id,
          to: "+15555550124",
          text: "Fixture",
        })
      ).status,
    ).toBe("accepted");
  });
});
