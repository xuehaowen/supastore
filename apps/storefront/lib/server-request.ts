import { resolvePublicOrigin } from "../../../packages/config/public-origin.mjs";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { proxyBackendApi } from "./backend-proxy";
import { boundedJson } from "./bounded-json";
import { BackendApiError } from "./api";

export function actionFailure(error: unknown, operation: string) {
  const serverFailure =
    !(error instanceof BackendApiError) || error.status >= 500;
  const requestId = serverFailure
    ? (error instanceof BackendApiError ? error.requestId : undefined) ||
      crypto.randomUUID()
    : undefined;
  if (serverFailure)
    console.error(
      JSON.stringify({
        operation,
        requestId,
        code: "STOREFRONT_ACTION_FAILED",
      }),
    );
  return {
    message:
      error instanceof BackendApiError
        ? error.message
        : "Unable to save. Please retry.",
    ...(requestId ? { requestId } : {}),
  };
}

/** Mutations use the existing proxy and relay every HttpOnly cookie to the browser. */
export async function serverRequest(
  path: string,
  body: Record<string, unknown>,
  method = "POST",
) {
  const incoming = await headers();
  const origin = resolvePublicOrigin(process.env);
  const forwarded = new Headers({
    "content-type": "application/json",
    origin,
    cookie: (await cookies()).toString(),
  });
  // Reuse trusted ingress validation, rather than forwarding arbitrary IP headers.
  for (const key of ["x-supastore-edge-token", "x-supastore-client-ip"]) {
    const value = incoming.get(key);
    if (value) forwarded.set(key, value);
  }
  const response = await proxyBackendApi(
    new Request(new URL(`/api/v1/${path}`, origin), {
      method,
      headers: forwarded,
      body: JSON.stringify(body),
    }),
  );
  for (const value of response.headers.getSetCookie()) {
    const parsed = new NextResponse(null, { headers: { "set-cookie": value } })
      .cookies;
    for (const cookie of parsed.getAll()) (await cookies()).set(cookie);
  }
  const result = (await boundedJson(response)) as {
    data?: unknown;
    error?: { message?: string };
  };
  if (!response.ok)
    throw new BackendApiError(
      result.error?.message || "Unable to save. Please retry.",
      response.status,
      /^[0-9a-f-]{36}$/i.test(response.headers.get("x-request-id") || "")
        ? response.headers.get("x-request-id")!
        : undefined,
    );
  return result.data;
}
