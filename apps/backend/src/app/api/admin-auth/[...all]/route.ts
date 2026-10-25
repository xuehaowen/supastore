import { staffAuth } from "@/infrastructure/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { readApiBody } from "@/infrastructure/http/commerce-api";

const handlers = toNextJsHandler(staffAuth);
export async function GET(request: Request) {
  if (
    new URL(request.url).pathname.replace(/\/$/, "") !==
    "/api/admin-auth/get-session"
  )
    return new Response(null, { status: 404 });
  const response = await handlers.GET(request);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
export async function POST(request: Request) {
  const path = new URL(request.url).pathname.replace(/\/$/, "");
  if (
    ![
      "/api/admin-auth/sign-in/email",
      "/api/admin-auth/sign-out",
      ...["enable", "disable", "verify-totp", "verify-backup-code"].map(
        (operation) => `/api/admin-auth/two-factor/${operation}`,
      ),
    ].includes(path)
  )
    return new Response(null, { status: 404 });
  if (path.includes("/two-factor/")) {
    try {
      const body = await readApiBody(request);
      if (
        body.trustDevice ||
        (body.method !== undefined && body.method !== "totp")
      )
        return Response.json(
          { message: "Authenticator verification required." },
          { status: 400 },
        );
      const headers = new Headers(request.headers);
      headers.delete("content-length");
      request = new Request(request.url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
    } catch {
      return Response.json(
        { message: "Invalid authentication request." },
        { status: 400 },
      );
    }
  }
  const response = await handlers.POST(request);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
