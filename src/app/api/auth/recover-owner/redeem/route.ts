import { NextRequest, NextResponse } from "next/server";
import { redeemOwnerRecovery } from "@/application/use-cases/staff/redeem-owner-recovery";
import { auth } from "@/infrastructure/auth";
import { makeSignature } from "better-auth/crypto";
import { UnauthorizedError } from "@/application/common/errors";

function sameSite(value?: string): "strict" | "lax" | "none" {
  switch (value?.toLowerCase()) {
    case "strict":
      return "strict";
    case "none":
      return "none";
    default:
      return "lax";
  }
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") || "";

  try {
    const context = await auth.$context;
    const { sessionToken, expiresAt } = await redeemOwnerRecovery(token);
    const signedToken = `${sessionToken}.${await makeSignature(sessionToken, context.secret)}`;

    const redirectUrl = new URL("/admin", request.url);
    const response = NextResponse.redirect(redirectUrl);

    const cookie = context.authCookies.sessionToken;
    response.cookies.set(cookie.name, signedToken, {
      ...cookie.attributes,
      sameSite: sameSite(cookie.attributes.sameSite),
      expires: expiresAt,
    });
    // An existing account's cookie cache must not override the recovered session.
    const cached = context.authCookies.sessionData;
    for (const existing of request.cookies.getAll())
      if (
        existing.name === cached.name ||
        existing.name.startsWith(`${cached.name}.`)
      )
        response.cookies.set(existing.name, "", {
          ...cached.attributes,
          sameSite: sameSite(cached.attributes.sameSite),
          maxAge: 0,
        });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");

    return response;
  } catch (error: unknown) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set(
      "error",
      error instanceof UnauthorizedError
        ? error.message
        : "Failed to redeem recovery link.",
    );
    return NextResponse.redirect(loginUrl);
  }
}
