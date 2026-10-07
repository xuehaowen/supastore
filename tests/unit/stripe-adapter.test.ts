import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  StripeAdapter,
  verifyStripeWebhook,
} from "@/infrastructure/payments/stripe";
const checkout = {
  id: "cs_test_123",
  url: "https://checkout.stripe.com/c/pay/123",
  status: "open",
  payment_status: "unpaid",
  payment_intent: "pi_123",
  amount_total: 1234,
  currency: "usd",
  metadata: { orderId: "order-1" },
};
describe("Stripe REST adapter", () => {
  it("uses authoritative amount, allowlisted callbacks, card-only payment and stable retry identity", async () => {
    const network = vi.fn().mockResolvedValue(Response.json(checkout));
    const adapter = new StripeAdapter(
      "sk_test_example",
      "https://shop.example",
      network,
    );
    await adapter.createCheckoutSession({
      orderId: "order-1",
      amountCents: 1234,
      currency: "USD",
      successUrl: "https://shop.example/en/orders/order-1",
      cancelUrl: "https://shop.example/en/cart",
      idempotencyKey: "checkout:order-1",
    });
    expect(network.mock.calls[0]![0]).toBe(
      "https://api.stripe.com/v1/checkout/sessions",
    );
    const options = network.mock.calls[0]![1];
    expect(options.headers["Idempotency-Key"]).toBe("checkout:order-1");
    const parameters = new URLSearchParams(options.body);
    expect(parameters.get("line_items[0][price_data][unit_amount]")).toBe(
      "1234",
    );
    expect(parameters.get("payment_method_types[0]")).toBe("card");
    expect(parameters.get("payment_intent_data[metadata][orderId]")).toBe(
      "order-1",
    );
    await expect(
      adapter.createCheckoutSession({
        orderId: "order-1",
        amountCents: 1234,
        currency: "USD",
        successUrl: "https://attacker.example",
        cancelUrl: "https://shop.example",
        idempotencyKey: "same",
      }),
    ).rejects.toThrow("Untrusted");
    expect(network).toHaveBeenCalledTimes(1);
  });
  it("validates provider identifiers and requires POST idempotency", async () => {
    const network = vi.fn();
    const adapter = new StripeAdapter(
      "sk_test_example",
      "https://shop.example",
      network,
    );
    await expect(adapter.retrieveCheckoutSession("../refunds")).rejects.toThrow(
      "identifier",
    );
    await expect(
      adapter.expireCheckoutSession("cs_test_123", ""),
    ).rejects.toThrow("idempotency");
    expect(network).not.toHaveBeenCalled();
  });
  it("creates original-payment refunds and distinguishes pending from succeeded", async () => {
    const network = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          id: "re_123",
          amount: 400,
          currency: "usd",
          payment_intent: "pi_123",
          status: "pending",
        }),
      );
    const adapter = new StripeAdapter(
      "sk_test_example",
      "https://shop.example",
      network,
    );
    const result = await adapter.createRefund({
      paymentIntentId: "pi_123",
      amountCents: 400,
      idempotencyKey: "refund:authorized-1",
    });
    expect(result.status).toBe("pending");
    const parameters = new URLSearchParams(network.mock.calls[0]![1].body);
    expect(parameters.get("payment_intent")).toBe("pi_123");
    expect(parameters.get("amount")).toBe("400");
  });
  it("does not expose provider messages/secrets and surfaces malformed responses", async () => {
    const network = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { error: { message: "sensitive provider text" } },
          { status: 401 },
        ),
      )
      .mockResolvedValueOnce(Response.json({ id: "cs_123" }));
    const adapter = new StripeAdapter(
      "sk_test_example",
      "https://shop.example",
      network,
    );
    await expect(
      adapter.retrieveCheckoutSession("cs_test_123"),
    ).rejects.toThrow("Payment provider rejected");
    await expect(
      adapter.retrieveCheckoutSession("cs_test_123"),
    ).rejects.toThrow("Invalid checkout response");
  });
});
describe("Stripe raw webhook signature", () => {
  const secret = "whsec_fixture";
  const timestamp = 1700000000;
  const body =
    '{"id":"evt_123","type":"checkout.session.completed","livemode":false,"data":{"object":{"id":"cs_test_123"}}}';
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  it("accepts exact signed bytes and key rotation signatures", () => {
    expect(
      verifyStripeWebhook(
        Buffer.from(body),
        `t=${timestamp},v1=${"0".repeat(64)},v1=${signature}`,
        secret,
        timestamp,
      ).id,
    ).toBe("evt_123");
  });
  it("rejects tampering, old/future timestamps, duplicate timestamps and malformed signatures", () => {
    expect(() =>
      verifyStripeWebhook(
        body + " ",
        `t=${timestamp},v1=${signature}`,
        secret,
        timestamp,
      ),
    ).toThrow("signature");
    for (const now of [timestamp + 301, timestamp - 301])
      expect(() =>
        verifyStripeWebhook(
          body,
          `t=${timestamp},v1=${signature}`,
          secret,
          now,
        ),
      ).toThrow("tolerance");
    expect(() =>
      verifyStripeWebhook(
        body,
        `t=${timestamp},t=${timestamp},v1=${signature}`,
        secret,
        timestamp,
      ),
    ).toThrow("tolerance");
    expect(() =>
      verifyStripeWebhook(body, `t=${timestamp},v1=invalid`, secret, timestamp),
    ).toThrow("signature");
  });
});
