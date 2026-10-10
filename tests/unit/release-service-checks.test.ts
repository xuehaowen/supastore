import { describe, it, expect, vi } from "vitest";
import { checkReleaseServices } from "../../scripts/check-release-services.mjs";

describe("read-only release service checks", () => {
  it("verifies OAuth with renewable credentials without sending or exposing them", async () => {
    const verify = vi.fn().mockResolvedValue(true);
    const close = vi.fn();
    const factory = vi.fn(() => ({ verify, close }));
    const env = {
      EMAIL_PROVIDER: "nodemailer-oauth2",
      SMTP_HOST: "smtp.gmail.com",
      SMTP_FROM: "store@gmail.com",
      SMTP_USER: "store@gmail.com",
      SMTP_PORT: "465",
      SMTP_SECURE: "true",
      SMTP_OAUTH_CLIENT_ID: "fixture-client",
      SMTP_OAUTH_CLIENT_SECRET: "private-secret",
      SMTP_OAUTH_REFRESH_TOKEN: "private-refresh",
    };
    const results = await checkReleaseServices(env, {
      connect: true,
      transportFactory: factory,
    });
    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: {
          type: "OAuth2",
          user: env.SMTP_USER,
          clientId: env.SMTP_OAUTH_CLIENT_ID,
          clientSecret: env.SMTP_OAUTH_CLIENT_SECRET,
          refreshToken: env.SMTP_OAUTH_REFRESH_TOKEN,
        },
      }),
    );
    expect(results[1]).toMatchObject({
      mode: "nodemailer-oauth2",
      configured: true,
      connection: "authenticated",
    });
    expect(JSON.stringify(results)).not.toContain("private");
    expect(verify).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
  it("does not probe incomplete OAuth or a disabled email provider", async () => {
    const factory = vi.fn();
    for (const EMAIL_PROVIDER of ["nodemailer-oauth2", "disabled"]) {
      const results = await checkReleaseServices(
        {
          EMAIL_PROVIDER,
          SMTP_HOST: "smtp.gmail.com",
          SMTP_FROM: "store@gmail.com",
        },
        { connect: true, transportFactory: factory },
      );
      expect(results[1].configured).toBe(false);
    }
    expect(factory).not.toHaveBeenCalled();
  });
  it("requires STARTTLS for OAuth probes on port 587 and refuses insecure configuration", async () => {
    const factory = vi.fn(() => ({
      verify: vi.fn().mockResolvedValue(true),
      close: vi.fn(),
    }));
    const env = {
      EMAIL_PROVIDER: "nodemailer-oauth2",
      SMTP_HOST: "smtp.gmail.com",
      SMTP_FROM: "store@gmail.com",
      SMTP_USER: "store@gmail.com",
      SMTP_PORT: "587",
      SMTP_OAUTH_CLIENT_ID: "fixture-client",
      SMTP_OAUTH_CLIENT_SECRET: "fixture-secret",
      SMTP_OAUTH_REFRESH_TOKEN: "fixture-refresh",
    };
    await checkReleaseServices(env, {
      connect: true,
      transportFactory: factory,
    });
    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({ secure: false, requireTLS: true }),
    );
    factory.mockClear();
    const result = await checkReleaseServices(
      { ...env, SMTP_REQUIRE_TLS: "false" },
      { connect: true, transportFactory: factory },
    );
    expect(result[1].configured).toBe(false);
    expect(factory).not.toHaveBeenCalled();
  });
  it("does not connect by default or expose credentials", async () => {
    const fetcher = vi.fn();
    const transportFactory = vi.fn();
    const results = await checkReleaseServices(
      {
        STRIPE_SECRET_KEY: "sk_test_private",
        STRIPE_WEBHOOK_SECRET: "whsec_private",
        SMTP_HOST: "mail.test",
        SMTP_FROM: "store@example.test",
      },
      { fetcher, transportFactory },
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(transportFactory).not.toHaveBeenCalled();
    expect(JSON.stringify(results)).not.toContain("private");
    expect(results[0].mode).toBe("test");
  });
  it("verifies authentication without issuing a payment or email and closes transport", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    const verify = vi.fn().mockResolvedValue(true);
    const close = vi.fn();
    const results = await checkReleaseServices(
      {
        STRIPE_SECRET_KEY: "sk_test_private",
        STRIPE_WEBHOOK_SECRET: "whsec_private",
        SMTP_HOST: "mail.test",
        SMTP_FROM: "store@example.test",
      },
      { connect: true, fetcher, transportFactory: () => ({ verify, close }) },
    );
    expect(fetcher.mock.calls[0][0]).toBe("https://api.stripe.com/v1/account");
    expect(results[0].connection).toBe("authenticated");
    expect(results[1].connection).toBe("authenticated");
    expect(close).toHaveBeenCalledOnce();
  });
  it("reports a sanitized authentication failure without leaking provider messages", async () => {
    const close = vi.fn();
    const results = await checkReleaseServices(
      { SMTP_HOST: "mail.test", SMTP_FROM: "store@example.test" },
      {
        connect: true,
        transportFactory: () => ({
          verify: async () => {
            throw Object.assign(new Error("private credential data"), {
              code: "EAUTH",
            });
          },
          close,
        }),
      },
    );
    expect(results[1]?.failureCode).toBe("EAUTH");
    expect(JSON.stringify(results)).not.toContain("private credential data");
    expect(close).toHaveBeenCalledOnce();
  });
});
