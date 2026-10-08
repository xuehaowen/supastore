import { describe, it, expect, vi } from "vitest";
import { checkReleaseServices } from "../../scripts/check-release-services.mjs";

describe("read-only release service checks", () => {
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
