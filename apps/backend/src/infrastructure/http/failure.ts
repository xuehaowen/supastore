import { randomUUID } from "node:crypto";
import { ValiError } from "valibot";
import { DomainError } from "@/application/common/errors";
import { logger } from "@/infrastructure/security/logger";

/** Never retain raw provider messages, SQL, URLs, input, or stacks at request boundaries. */
export function safeFailureCode(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  return typeof code === "string" &&
    /^(?:[A-Z][A-Z0-9_]{1,63}|[0-9]{2}[A-Z0-9]{3})$/.test(code)
    ? code
    : "UNEXPECTED_ERROR";
}
export function logFailure(
  error: unknown,
  operation: string,
  context: Record<string, string> = {},
) {
  logger
    .child({
      requestId: randomUUID(),
      ...context,
      operation,
      failureCode: safeFailureCode(error),
    })
    .error("Operation failed.");
}
export function describeFailure(
  error: unknown,
  operation: string,
  fallback = "Unable to complete request.",
  requestId: string = randomUUID(),
) {
  const known = error instanceof DomainError || error instanceof ValiError;
  const code =
    error instanceof DomainError
      ? error.code
      : known
        ? "INVALID_INPUT"
        : "INTERNAL_ERROR";
  const category =
    code === "UNAUTHORIZED"
      ? "authentication"
      : code === "FORBIDDEN"
        ? "authorization"
        : code === "NOT_FOUND"
          ? "not_found"
          : code === "CONFLICT"
            ? "conflict"
            : code === "DEPENDENCY_UNAVAILABLE"
              ? "dependency"
              : code === "OUTCOME_UNCERTAIN"
                ? "uncertain"
                : known
                  ? "validation"
                  : "unexpected";
  const status = {
    authentication: 401,
    authorization: 403,
    not_found: 404,
    conflict: 409,
    dependency: 503,
    uncertain: 409,
    validation: 400,
    unexpected: 500,
  }[category];
  if (!known || category === "dependency" || category === "uncertain")
    logFailure(error, operation, { requestId });
  return {
    code,
    category,
    status,
    requestId,
    retryable: category === "dependency",
    message: known ? error.message : fallback,
  };
}
export function actionError(
  error: unknown,
  operation: string,
  fallback: string,
) {
  const failure = describeFailure(error, operation, fallback);
  return failure.status >= 500
    ? `${failure.message} Reference: ${failure.requestId}`
    : failure.message;
}

/** Legacy endpoints retain their string error envelope while sharing the contract. */
export function failureResponse(
  error: unknown,
  operation: string,
  fallback?: string,
) {
  const failure = describeFailure(error, operation, fallback);
  return Response.json(
    {
      error: failure.message,
      code: failure.code,
      requestId: failure.requestId,
      retryable: failure.retryable,
    },
    {
      status: failure.status,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Request-ID": failure.requestId,
        ...(failure.retryable ? { "Retry-After": "60" } : {}),
      },
    },
  );
}
