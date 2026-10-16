import { staffAuth } from "@/infrastructure/auth";
import { toNextJsHandler } from "better-auth/next-js";

const handlers = toNextJsHandler(staffAuth);
export async function GET(request: Request) {
  if (
    new URL(request.url).pathname.replace(/\/$/, "") !==
    "/api/admin-auth/get-session"
  )
    return new Response(null, { status: 404 });
  return handlers.GET(request);
}
export async function POST(request: Request) {
  const path = new URL(request.url).pathname.replace(/\/$/, "");
  if (
    !["/api/admin-auth/sign-in/email", "/api/admin-auth/sign-out"].includes(
      path,
    )
  )
    return new Response(null, { status: 404 });
  return handlers.POST(request);
}
