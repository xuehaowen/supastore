import type {
  SendResult,
  TransportCapabilities,
} from "@/application/ports/notifications";
export const RETRY_DELAYS_MS = [
  60_000, 300_000, 900_000, 3_600_000, 21_600_000,
];
export const MAX_DELIVERY_ATTEMPTS = 6;
export type DeliveryStatus =
  | "pending"
  | "retrying"
  | "dispatching"
  | "accepted"
  | "awaiting"
  | "sent"
  | "delivered"
  | "failed"
  | "review"
  | "suppressed"
  | "exhausted";
export function getNextRetryInfo(currentAttempts: number, now = Date.now()) {
  const attempts = currentAttempts + 1;
  return {
    status:
      attempts >= MAX_DELIVERY_ATTEMPTS
        ? ("exhausted" as const)
        : ("retrying" as const),
    attempts,
    retryAfter: new Date(
      now +
        (attempts >= MAX_DELIVERY_ATTEMPTS
          ? 0
          : (RETRY_DELAYS_MS[attempts - 1] ?? 21_600_000)),
    ),
  };
}
export function deliveryOutcome(
  result: SendResult,
  input: {
    attempts: number;
    firstSubmittedAt: Date;
    now: Date;
    capabilities: TransportCapabilities;
    hadUncertainty?: boolean;
  },
): { status: DeliveryStatus; retryAfter: Date; providerStatus: string } {
  if (result.status === "accepted")
    return {
      status: input.capabilities.deliveryTracking ? "awaiting" : "accepted",
      retryAfter: input.now,
      providerStatus: "accepted",
    };
  const uncertain =
    result.status === "unknown" || Boolean(input.hadUncertainty);
  const delay =
    result.status === "rejected" ? Math.max(0, result.retryAfterMs ?? 0) : 0;
  const providerRetryAfter = new Date(input.now.getTime() + delay);
  if (result.status === "rejected" && !result.retryable)
    return {
      status: uncertain ? "review" : "failed",
      retryAfter: providerRetryAfter,
      providerStatus: result.code,
    };
  if (uncertain) {
    const window = input.capabilities.idempotencyWindowMs;
    if (
      !window ||
      window <= 0 ||
      input.now.getTime() >= input.firstSubmittedAt.getTime() + window
    )
      return {
        status: "review",
        retryAfter: providerRetryAfter,
        providerStatus: result.code,
      };
  }
  const retry = getNextRetryInfo(input.attempts - 1, input.now.getTime());
  if (uncertain && retry.status === "exhausted")
    return {
      status: "review",
      retryAfter: providerRetryAfter,
      providerStatus: result.code,
    };
  const retryAfter = new Date(
    Math.max(retry.retryAfter.getTime(), input.now.getTime() + delay),
  );
  if (
    uncertain &&
    retryAfter.getTime() >=
      input.firstSubmittedAt.getTime() + input.capabilities.idempotencyWindowMs!
  )
    return {
      status: "review",
      retryAfter,
      providerStatus: result.code,
    };
  return { status: retry.status, retryAfter, providerStatus: result.code };
}
export function callbackStatus(
  current: DeliveryStatus,
  event: "sent" | "delivered" | "failed",
  older: boolean,
): DeliveryStatus {
  if (current === "delivered") return current;
  if (event === "delivered") return "delivered";
  if (older || (current === "failed" && event === "sent")) return current;
  return event;
}
