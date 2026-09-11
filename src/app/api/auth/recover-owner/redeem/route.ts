import { NextRequest, NextResponse } from "next/server";
import { redeemOwnerRecovery } from "@/application/use-cases/staff/redeem-owner-recovery";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") || "";

  try {
    const { sessionToken, expiresAt } = await redeemOwnerRecovery(token);

    const redirectUrl = new URL("/admin", request.url);
    const response = NextResponse.redirect(redirectUrl);

    // Set Better-Auth session cookie
    const isSecure =
      process.env.NODE_ENV === "production" ||
      request.nextUrl.protocol === "https:";

    // Set standard session cookie
    response.cookies.set("better-auth.session_token", sessionToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });

    // Also set secure prefix cookie if running on HTTPS
    if (isSecure) {
      response.cookies.set(
        "__Secure-better-auth.session_token",
        sessionToken,
        {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/",
          expires: expiresAt,
        }
      );
    }

    return response;
  } catch (error: any) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set(
      "error",
      error.message || "Failed to redeem recovery link."
    );
    return NextResponse.redirect(loginUrl);
  }
}
