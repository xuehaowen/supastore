import { NextResponse, type NextRequest } from "next/server";
import { localeFromPath } from "../../../packages/i18n/src/customer";
import { backendOwnsRoute } from "./infrastructure/http/service-routes";
export function middleware(request: NextRequest) {
  if (process.env.SERVICE_ROLE === "backend") {
    if (request.nextUrl.pathname === "/")
      return NextResponse.redirect(new URL("/admin", request.url));
    if (!backendOwnsRoute(request.nextUrl.pathname))
      return new NextResponse(null, { status: 404 });
  }
  const headers = new Headers(request.headers);
  headers.set(
    "x-store-locale",
    localeFromPath(
      request.nextUrl.pathname,
      request.nextUrl.searchParams.get("locale"),
    ),
  );
  return NextResponse.next({ request: { headers } });
}
export const config = { matcher: ["/((?!api|_next|favicon.ico).*)"] };
