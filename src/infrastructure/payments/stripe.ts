import { createHmac, timingSafeEqual } from "node:crypto";

export class StripeAdapterError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly requestId: string | null = null,
  ) {
    super(message);
    this.name = "StripeAdapterError";
  }
}
export interface StripeSession {
  id: string;
  url: string | null;
  status: "open" | "complete" | "expired";
  payment_status: "paid" | "unpaid" | "no_payment_required";
  payment_intent: string | null;
  amount_total: number | null;
  currency: string | null;
  metadata: Record<string, string>;
}
export interface StripeRefund {
  id: string;
  amount: number;
  currency: string;
  payment_intent: string | null;
  status: "pending" | "requires_action" | "succeeded" | "failed" | "canceled";
}
export interface StripeEvent {
  id: string;
  type: string;
  livemode: boolean;
  data: { object: Record<string, unknown> };
}
function identifier(value: string, prefix: string) {
  if (!new RegExp(`^${prefix}_[A-Za-z0-9_]{1,200}$`).test(value))
    throw new StripeAdapterError("Invalid provider identifier.");
  return value;
}
function amount(value: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647)
    throw new StripeAdapterError("Invalid payment amount.");
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new StripeAdapterError("Invalid provider response.");
  return value as Record<string, unknown>;
}
function session(value: unknown): StripeSession {
  const v = record(value);
  if (
    typeof v.id !== "string" ||
    !v.id.startsWith("cs_") ||
    !["open", "complete", "expired"].includes(String(v.status)) ||
    !["paid", "unpaid", "no_payment_required"].includes(
      String(v.payment_status),
    ) ||
    (v.amount_total !== null &&
      (!Number.isSafeInteger(v.amount_total) || Number(v.amount_total) < 0)) ||
    (v.payment_intent !== null && typeof v.payment_intent !== "string") ||
    (v.currency !== null && typeof v.currency !== "string") ||
    (v.url !== null && typeof v.url !== "string")
  )
    throw new StripeAdapterError("Invalid checkout response.");
  if (
    typeof v.url === "string" &&
    new URL(v.url).origin !== "https://checkout.stripe.com"
  )
    throw new StripeAdapterError("Invalid checkout URL.");
  const metadata = record(v.metadata);
  if (Object.values(metadata).some((m) => typeof m !== "string"))
    throw new StripeAdapterError("Invalid checkout metadata.");
  return {
    id: v.id,
    url: v.url as string | null,
    status: v.status as StripeSession["status"],
    payment_status: v.payment_status as StripeSession["payment_status"],
    payment_intent: v.payment_intent as string | null,
    amount_total: v.amount_total as number | null,
    currency: v.currency as string | null,
    metadata: metadata as Record<string, string>,
  };
}
function refund(value: unknown): StripeRefund {
  const v = record(value);
  if (
    typeof v.id !== "string" ||
    !v.id.startsWith("re_") ||
    !Number.isSafeInteger(v.amount) ||
    Number(v.amount) < 1 ||
    typeof v.currency !== "string" ||
    !["pending", "requires_action", "succeeded", "failed", "canceled"].includes(
      String(v.status),
    ) ||
    (v.payment_intent !== null && typeof v.payment_intent !== "string")
  )
    throw new StripeAdapterError("Invalid refund response.");
  return {
    id: v.id,
    amount: v.amount as number,
    currency: v.currency,
    payment_intent: v.payment_intent as string | null,
    status: v.status as StripeRefund["status"],
  };
}

/** Network adapter only. Persist request identity before calling; never call while holding database locks. */
export class StripeAdapter {
  private readonly origin: string;
  constructor(
    private readonly secretKey: string,
    storefrontOrigin: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!/^sk_(test|live)_[A-Za-z0-9]+$/.test(secretKey))
      throw new StripeAdapterError("Stripe secret key is not configured.");
    const url = new URL(storefrontOrigin);
    if (
      url.username ||
      url.password ||
      (url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname)
        ))
    )
      throw new StripeAdapterError("Invalid storefront origin.");
    this.origin = url.origin;
  }
  private callback(value: string) {
    const url = new URL(value);
    if (url.origin !== this.origin || url.username || url.password)
      throw new StripeAdapterError("Untrusted payment callback URL.");
    return value;
  }
  private async request(
    path: string,
    parameters?: URLSearchParams,
    idempotencyKey?: string,
  ) {
    if (
      parameters &&
      (!idempotencyKey ||
        idempotencyKey.length > 255 ||
        !/^[\x21-\x7e]+$/.test(idempotencyKey))
    )
      throw new StripeAdapterError("A stable idempotency key is required.");
    let response: Response;
    try {
      response = await this.fetcher(`https://api.stripe.com/v1/${path}`, {
        method: parameters ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          ...(parameters
            ? {
                "Content-Type": "application/x-www-form-urlencoded",
                "Idempotency-Key": idempotencyKey!,
              }
            : {}),
        },
        ...(parameters ? { body: parameters.toString() } : {}),
        signal: AbortSignal.timeout(10000),
        redirect: "error",
        cache: "no-store",
      });
    } catch {
      throw new StripeAdapterError(
        "Payment provider request failed; reconcile before retrying.",
      );
    }
    if (!response.ok)
      throw new StripeAdapterError(
        "Payment provider rejected the request.",
        response.status,
        response.headers.get("request-id"),
      );
    try {
      return record(await response.json());
    } catch {
      throw new StripeAdapterError(
        "Invalid payment provider response.",
        response.status,
        response.headers.get("request-id"),
      );
    }
  }
  async createCheckoutSession(input: {
    orderId: string;
    amountCents: number;
    currency: string;
    successUrl: string;
    cancelUrl: string;
    idempotencyKey: string;
  }) {
    amount(input.amountCents);
    if (
      !/^[a-z]{3}$/i.test(input.currency) ||
      !/^[a-zA-Z0-9-]{1,100}$/.test(input.orderId)
    )
      throw new StripeAdapterError("Invalid checkout input.");
    const parameters = new URLSearchParams({
      mode: "payment",
      "payment_method_types[0]": "card",
      success_url: this.callback(input.successUrl),
      cancel_url: this.callback(input.cancelUrl),
      client_reference_id: input.orderId,
      "metadata[orderId]": input.orderId,
      "payment_intent_data[metadata][orderId]": input.orderId,
      "line_items[0][price_data][currency]": input.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": String(input.amountCents),
      "line_items[0][price_data][product_data][name]": "Order payment",
      "line_items[0][quantity]": "1",
    });
    return session(
      await this.request("checkout/sessions", parameters, input.idempotencyKey),
    );
  }
  async retrieveCheckoutSession(id: string) {
    return session(
      await this.request(`checkout/sessions/${identifier(id, "cs")}`),
    );
  }
  async expireCheckoutSession(id: string, idempotencyKey: string) {
    return session(
      await this.request(
        `checkout/sessions/${identifier(id, "cs")}/expire`,
        new URLSearchParams(),
        idempotencyKey,
      ),
    );
  }
  async createRefund(input: {
    paymentIntentId: string;
    amountCents: number;
    idempotencyKey: string;
  }) {
    amount(input.amountCents);
    return refund(
      await this.request(
        "refunds",
        new URLSearchParams({
          payment_intent: identifier(input.paymentIntentId, "pi"),
          amount: String(input.amountCents),
        }),
        input.idempotencyKey,
      ),
    );
  }
  async retrieveRefund(id: string) {
    return refund(await this.request(`refunds/${identifier(id, "re")}`));
  }
}
export function stripeFromEnvironment() {
  return new StripeAdapter(
    process.env.STRIPE_SECRET_KEY ?? "",
    process.env.STOREFRONT_ORIGIN || process.env.APP_URL || "",
  );
}
/** Verify exact raw bytes before parsing. Multiple v1 signatures support signing-key rotation. */
export function verifyStripeWebhook(
  rawBody: string | Uint8Array,
  signature: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): StripeEvent {
  if (
    !secret.startsWith("whsec_") ||
    signature.length > 4096 ||
    Buffer.byteLength(rawBody) > 1048576
  )
    throw new StripeAdapterError("Invalid webhook signature.");
  const components = signature.split(",").map((s) => s.trim().split("="));
  const timestamps = components.filter((c) => c[0] === "t");
  const timestamp = timestamps[0]?.[1] ?? "";
  if (
    timestamps.length !== 1 ||
    !/^\d{1,12}$/.test(timestamp) ||
    Math.abs(nowSeconds - Number(timestamp)) > 300
  )
    throw new StripeAdapterError("Webhook timestamp outside tolerance.");
  const bytes = Buffer.from(rawBody);
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.`)
    .update(bytes)
    .digest();
  const valid = components
    .filter((c) => c[0] === "v1" && /^[a-f0-9]{64}$/i.test(c[1] ?? ""))
    .some((c) => timingSafeEqual(expected, Buffer.from(c[1]!, "hex")));
  if (!valid) throw new StripeAdapterError("Invalid webhook signature.");
  let event: Record<string, unknown>;
  try {
    event = record(JSON.parse(bytes.toString("utf8")));
  } catch {
    throw new StripeAdapterError("Invalid webhook payload.");
  }
  const data = record(event.data);
  if (
    typeof event.id !== "string" ||
    !/^evt_[A-Za-z0-9_]+$/.test(event.id) ||
    typeof event.type !== "string" ||
    typeof event.livemode !== "boolean"
  )
    throw new StripeAdapterError("Invalid webhook event.");
  return {
    id: event.id,
    type: event.type,
    livemode: event.livemode,
    data: { object: record(data.object) },
  };
}
