import { describe, expect, it } from "vitest";
import {
  deliveryOutcome,
  callbackStatus,
} from "@/application/notifications/delivery-policy";
const now = new Date("2026-10-06T12:00:00Z");
const context = {
  attempts: 1,
  now,
  firstSubmittedAt: now,
  capabilities: { deliveryTracking: false },
};
describe("provider-neutral delivery outcome policy", () => {
  it("distinguishes untracked acceptance from tracked delivery awaiting callback", () => {
    expect(
      deliveryOutcome({ status: "accepted", providerMessageId: "a" }, context)
        .status,
    ).toBe("accepted");
    expect(
      deliveryOutcome(
        { status: "accepted", providerMessageId: "a" },
        { ...context, capabilities: { deliveryTracking: true } },
      ).status,
    ).toBe("awaiting");
  });
  it("does not replay ambiguous SMTP or SMS requests without provider idempotency", () => {
    expect(
      deliveryOutcome({ status: "unknown", code: "connection_lost" }, context)
        .status,
    ).toBe("review");
  });
  it("bounds unknown retries by the original provider guarantee window", () => {
    const capabilities = {
      deliveryTracking: true,
      idempotencyWindowMs: 300000,
    };
    expect(
      deliveryOutcome(
        { status: "unknown", code: "timeout" },
        { ...context, capabilities },
      ).status,
    ).toBe("retrying");
    expect(
      deliveryOutcome(
        { status: "unknown", code: "timeout" },
        {
          ...context,
          firstSubmittedAt: new Date(now.getTime() - 300000),
          capabilities,
        },
      ).status,
    ).toBe("review");
    expect(
      deliveryOutcome(
        { status: "unknown", code: "timeout" },
        {
          ...context,
          capabilities: { ...capabilities, idempotencyWindowMs: 60000 },
        },
      ).status,
    ).toBe("review");
    expect(
      deliveryOutcome(
        { status: "unknown", code: "timeout" },
        { ...context, attempts: 6, capabilities },
      ).status,
    ).toBe("review");
  });
  it("handles permanent rejections and provider retry-after without treating them as delivery", () => {
    expect(
      deliveryOutcome(
        { status: "rejected", code: "invalid_phone", retryable: false },
        context,
      ).status,
    ).toBe("failed");
    expect(
      deliveryOutcome(
        {
          status: "rejected",
          code: "rate_limit",
          retryable: true,
          retryAfterMs: 120000,
        },
        context,
      ).retryAfter.getTime(),
    ).toBe(now.getTime() + 120000);
    expect(
      deliveryOutcome(
        { status: "rejected", code: "outage", retryable: true },
        { ...context, attempts: 6 },
      ).status,
    ).toBe("exhausted");
  });
  it("keeps prior ambiguity bounded when a later request receives a rejection", () => {
    const capabilities = {deliveryTracking: true, idempotencyWindowMs: 300000};
    const rejected = {status: "rejected" as const, code: "rate_limit", retryable: true, retryAfterMs: 3600000};
    const result = deliveryOutcome(rejected, {...context, capabilities, attempts: 2, hadUncertainty: true});
    expect(result.status).toBe("review");
    expect(result.retryAfter.getTime()).toBe(now.getTime() + 3600000);
    expect(deliveryOutcome({status: "rejected", code: "invalid_request", retryable: false}, {...context, capabilities, hadUncertainty: true}).status).toBe("review");
    expect(deliveryOutcome({status: "accepted", providerMessageId: "resolved"}, {...context, capabilities, hadUncertainty: true}).status).toBe("awaiting");
  });
  it("keeps terminal delivery facts from regressing on duplicates and reordered callbacks", () => {
    expect(callbackStatus("delivered", "failed", false)).toBe("delivered");
    expect(callbackStatus("failed", "sent", false)).toBe("failed");
    expect(callbackStatus("awaiting", "sent", true)).toBe("awaiting");
    expect(callbackStatus("failed", "delivered", true)).toBe("delivered");
  });
});
