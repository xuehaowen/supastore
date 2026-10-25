/** Hosted payment transports return application data, never provider wire objects. */
export interface PaymentCheckoutSession {
  id: string;
  url: string | null;
  status: "open" | "complete" | "expired";
  paymentStatus: "paid" | "unpaid" | "no_payment_required";
  paymentId: string | null;
  amountCents: number | null;
  currency: string | null;
  metadata: Record<string, string>;
}
export interface PaymentRefund {
  id: string;
  amountCents: number;
  currency: string;
  paymentId: string | null;
  status: "pending" | "requires_action" | "succeeded" | "failed" | "canceled";
}
export interface PaymentProvider {
  readonly provider: string;
  readonly capabilities: {
    readonly hostedCheckout: boolean;
    readonly refunds: boolean;
    readonly idempotencyWindowMs: number;
  };
  createCheckoutSession(input: {
    orderId: string;
    amountCents: number;
    currency: string;
    successUrl: string;
    cancelUrl: string;
    idempotencyKey: string;
  }): Promise<PaymentCheckoutSession>;
  retrieveCheckoutSession(id: string): Promise<PaymentCheckoutSession>;
  expireCheckoutSession(
    id: string,
    idempotencyKey: string,
  ): Promise<PaymentCheckoutSession>;
  createRefund(input: {
    paymentId: string;
    amountCents: number;
    idempotencyKey: string;
  }): Promise<PaymentRefund>;
  retrieveRefund(id: string): Promise<PaymentRefund>;
}
