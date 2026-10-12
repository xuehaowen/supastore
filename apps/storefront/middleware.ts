import { NextResponse, type NextRequest } from "next/server";
import { localeFromPath } from "../../packages/i18n/src/customer";
export function middleware(request: NextRequest) {
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
