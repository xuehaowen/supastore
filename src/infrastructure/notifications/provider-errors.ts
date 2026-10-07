import type { SendResult } from "@/application/ports/notifications";
export function smtpFailure(error: unknown): SendResult {
  const e =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  if (
    typeof e.responseCode === "number" &&
    e.responseCode >= 400 &&
    e.responseCode <= 599
  )
    return {
      status: "rejected",
      code: `SMTP_${e.responseCode}`,
      retryable: e.responseCode < 500,
    };
  if (e.code === "EAUTH")
    return { status: "rejected", code: "SMTP_AUTH", retryable: false };
  if (e.code === "EDNS" || e.code === "ECONNREFUSED")
    return { status: "rejected", code: "SMTP_CONNECT", retryable: true };
  // Socket loss/timeout after DATA may hide a successful submission.
  return { status: "unknown", code: "SMTP_SUBMISSION_UNKNOWN" };
}
export function httpFailure(
  response: Response,
): Exclude<SendResult, { status: "accepted" }> {
  if (
    response.status >= 400 &&
    response.status < 500 &&
    ![408, 409].includes(response.status)
  ) {
    const delay = response.headers.get("retry-after");
    const seconds = delay && /^\d+$/.test(delay) ? Number(delay) : null;
    const retryAfterMs =
      seconds !== null && seconds <= 86400 ? seconds * 1000 : undefined;
    return {
      status: "rejected",
      code: `TELNYX_HTTP_${response.status}`,
      retryable: response.status === 429,
      ...(response.status === 429 && retryAfterMs !== undefined
        ? { retryAfterMs }
        : {}),
    };
  }
  return { status: "unknown", code: "TELNYX_SUBMISSION_UNKNOWN" };
}
