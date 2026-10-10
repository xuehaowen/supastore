import { describe, it, expect, vi } from "vitest";
import { createNotificationProviders } from "@/infrastructure/bootstrap/notification-providers";
import { OAuthEmailSender } from "@/infrastructure/notifications/oauth-email";
import {
  emailAdapters,
  createEmailAdapter,
} from "@/infrastructure/notifications/email-adapters";
import { NodemailerEmailSender } from "@/infrastructure/notifications/nodemailer-email";
import {
  notificationConfigFromEnvironment,
  nodemailerIdentity,
} from "@/infrastructure/notifications/provider-config";
import type { EmailTransportFactory } from "@/infrastructure/notifications/nodemailer-email";

const env = {
  EMAIL_PROVIDER: "nodemailer-oauth2",
  SMTP_HOST: "smtp.gmail.com",
  SMTP_PORT: "465",
  SMTP_SECURE: "true",
  SMTP_USER: "store@gmail.com",
  SMTP_FROM: "Store <store@gmail.com>",
  SMTP_OAUTH_CLIENT_ID: "fixture.apps.googleusercontent.com",
  SMTP_OAUTH_CLIENT_SECRET: "fixture-client-secret",
  SMTP_OAUTH_REFRESH_TOKEN: "fixture-refresh-token",
};

describe("OAuth email adapter", () => {
  it("dispatches stable unique handles through the adapter registry", () => {
    expect(Object.keys(emailAdapters)).toEqual([
      "nodemailer",
      "nodemailer-oauth2",
    ]);
    const config = notificationConfigFromEnvironment({
      ...env,
      EMAIL_PROVIDER: "nodemailer",
      SMTP_PASSWORD: "fixture-password",
    }).email!;
    const close = vi.fn();
    const sender = createEmailAdapter(config, () => ({
      sendMail: vi.fn(),
      close,
    }));
    expect(sender).toBeInstanceOf(NodemailerEmailSender);
    expect(sender).not.toBeInstanceOf(OAuthEmailSender);
    sender.close?.();
    expect(close).toHaveBeenCalledOnce();
  });
  it("maps authentication rejection without leaking credentials or retrying the message", async () => {
    const sendMail = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("private-refresh-token"), { code: "EAUTH" }),
      );
    const sender = createNotificationProviders(
      notificationConfigFromEnvironment(env),
      { emailTransportFactory: () => ({ sendMail, close: vi.fn() }) },
    ).email!;
    try {
      const result = await sender.send({
        deliveryId: "auth-failure",
        to: "buyer@example.test",
        subject: "Order",
        text: "Fixture",
      });
      expect(result).toEqual({
        status: "rejected",
        code: "SMTP_AUTH",
        retryable: false,
      });
      expect(JSON.stringify(result)).not.toContain("private");
      expect(sendMail).toHaveBeenCalledOnce();
    } finally {
      await sender.close?.();
    }
  });
  it("selects a separate adapter and configures renewable OAuth credentials with the bounded pool", async () => {
    const sendMail = vi
      .fn()
      .mockResolvedValue({ accepted: ["buyer@example.test"] });
    const close = vi.fn();
    const factory = vi.fn<EmailTransportFactory>(() => ({ sendMail, close }));
    const providers = createNotificationProviders(
      notificationConfigFromEnvironment(env),
      { emailTransportFactory: factory },
    );
    expect(providers.email).toBeInstanceOf(OAuthEmailSender);
    expect(factory.mock.calls[0]![0]).toMatchObject({
      pool: true,
      maxConnections: 1,
      requireTLS: true,
      auth: {
        type: "OAuth2",
        user: env.SMTP_USER,
        clientId: env.SMTP_OAUTH_CLIENT_ID,
        clientSecret: env.SMTP_OAUTH_CLIENT_SECRET,
        refreshToken: env.SMTP_OAUTH_REFRESH_TOKEN,
      },
    });
    expect(factory.mock.calls[0]![0].auth).not.toHaveProperty("pass");
    expect(
      await providers.email!.send({
        deliveryId: "oauth-fixture",
        to: "buyer@example.test",
        subject: "Order",
        text: "Confirmed",
      }),
    ).toMatchObject({ status: "accepted" });
    await providers.email!.close?.();
    expect(close).toHaveBeenCalledOnce();
  });
  it.each([
    "SMTP_USER",
    "SMTP_OAUTH_CLIENT_ID",
    "SMTP_OAUTH_CLIENT_SECRET",
    "SMTP_OAUTH_REFRESH_TOKEN",
  ])("rejects missing %s before constructing a transport", (field) => {
    const factory = vi.fn();
    expect(() =>
      createNotificationProviders(
        notificationConfigFromEnvironment({ ...env, [field]: "" }),
        { emailTransportFactory: factory },
      ),
    ).toThrow(field);
    expect(factory).not.toHaveBeenCalled();
  });
  it("rejects insecure OAuth transport and malformed credentials without exposing values", () => {
    expect(() =>
      notificationConfigFromEnvironment({
        ...env,
        SMTP_SECURE: "false",
        SMTP_REQUIRE_TLS: "false",
      }),
    ).toThrow("SMTP_REQUIRE_TLS");
    expect(() =>
      notificationConfigFromEnvironment({
        ...env,
        SMTP_OAUTH_REFRESH_TOKEN: "private\nvalue",
      }),
    ).toThrow("SMTP_OAUTH_REFRESH_TOKEN");
  });
  it("separates OAuth delivery identities from password SMTP without embedding secrets", () => {
    const oauth = notificationConfigFromEnvironment(env).email!;
    const password = notificationConfigFromEnvironment({
      ...env,
      EMAIL_PROVIDER: "nodemailer",
      SMTP_PASSWORD: "fixture-password",
    }).email!;
    expect(nodemailerIdentity(oauth)).not.toEqual(nodemailerIdentity(password));
    expect(JSON.stringify(nodemailerIdentity(oauth))).not.toContain(
      "fixture-refresh-token",
    );
    expect(
      nodemailerIdentity(
        notificationConfigFromEnvironment({
          ...env,
          SMTP_OAUTH_REFRESH_TOKEN: "rotated-token",
        }).email!,
      ),
    ).toEqual(nodemailerIdentity(oauth));
  });
});
