import { deadlineFetch as fetch } from "@/infrastructure/http/bounded-json";
export type CustomerAuthOperation =
  | "request-password-reset"
  | "reset-password"
  | "send-verification-email"
  | "change-password";

// Authentication and ownership are enforced by Better Auth using the current session.
export async function customerAuthRequest(
  operation: CustomerAuthOperation,
  body: Record<string, unknown>,
) {
  const response = await fetch(`/api/auth/${operation}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(
      "Unable to complete this request. Check your details and try again.",
    );
}
