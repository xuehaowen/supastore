import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { proxyBackendApi } from "./backend-proxy";
import { boundedJson } from "./bounded-json";
import { BackendApiError } from "./api";

/** Mutations use the existing proxy and relay every HttpOnly cookie to the browser. */
export async function serverRequest(
  path: string,
  body: Record<string, unknown>,
  method = "POST",
) {
  const incoming = await headers();
  const origin = process.env.STOREFRONT_ORIGIN || "http://localhost:3001";
  const forwarded = new Headers({
    "content-type": "application/json",
    origin,
    cookie: incoming.get("cookie") || "",
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
    );
  return result.data;
}
