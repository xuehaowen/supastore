import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "@supastore/contracts";
import { resolvePublicOrigin } from "../../../../../packages/config/public-origin.mjs";
import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins/two-factor";
import { createHmac } from "node:crypto";
import { APIError } from "better-auth/api";
import { and, eq } from "drizzle-orm";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/infrastructure/db";
import {
  staffMemberships,
  user,
  account,
  verification,
  session,
  staffSession,
  staffTwoFactor,
  authRateLimit,
} from "@/infrastructure/db/schema";
import { queueAuthEmail } from "@/infrastructure/notifications/smtp";
import { logFailure } from "@/infrastructure/http/failure";
import { authSecretFromEnvironment } from "./secret";

function createAuth(audience: "customer" | "staff") {
  const staff = audience === "staff";
  const rootSecret =
    authSecretFromEnvironment() ??
    "supastore-development-auth-secret-change-before-production";
  return betterAuth({
    baseURL: resolvePublicOrigin(process.env),
    basePath: staff ? "/api/admin-auth" : "/api/auth",
    secret: createHmac("sha256", rootSecret)
      .update(`supastore:${audience}`)
      .digest("hex"),
    appName: staff ? "Supastore staff" : "Supastore",
    plugins: staff
      ? [twoFactor({ issuer: "Supastore", twoFactorTable: "staffTwoFactor" })]
      : [],
    rateLimit: {
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/request-password-reset": { window: 60, max: 5 },
      },
    },
    advanced: {
      cookiePrefix: `supastore-${audience}`,
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
    },
    trustedOrigins: [
      ...(process.env.NODE_ENV === "production"
        ? []
        : ["http://localhost:3000", "http://127.0.0.1:3000"]),
      process.env.APP_URL,
      process.env.BETTER_AUTH_URL,
      process.env.STOREFRONT_ORIGIN,
    ].filter((origin): origin is string => Boolean(origin)),
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user,
        account,
        verification,
        session: staff ? staffSession : session,
        staffTwoFactor,
        rateLimit: authRateLimit,
      },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      revokeSessionsOnPasswordReset: true,
      requireEmailVerification: false,
      autoSignIn: false,
      resetPasswordTokenExpiresIn: 3600,
      disableSignUp: staff,
      onPasswordReset: async ({ user: identity }) => {
        // Credentials are shared even though ordinary session management is not.
        await db.transaction(async (tx) => {
          await tx.delete(session).where(eq(session.userId, identity.id));
          await tx
            .delete(staffSession)
            .where(eq(staffSession.userId, identity.id));
        });
      },
      sendResetPassword: async ({ user, url, token }) => {
        if (process.env.DISABLE_OUTBOUND_DELIVERY === "true") return;
        try {
          const result = await queueAuthEmail({
            recipient: user.email,
            template: "auth.reset_password",
            data: {
              resetUrl: url,
              recoveryUrl: url,
              token,
            },
          });
          if (!result.success) throw new Error("Email was not accepted.");
        } catch (error) {
          // Preserve the reset endpoint's account-enumeration protection.
          logFailure(error, "auth.reset_email_enqueue");
        }
      },
    },
    emailVerification: {
      expiresIn: 3600,
      sendOnSignUp: !staff,
      autoSignInAfterVerification: !staff,
      sendVerificationEmail: async ({ user, url, token }) => {
        if (process.env.DISABLE_OUTBOUND_DELIVERY === "true") return;
        try {
          const result = await queueAuthEmail({
            recipient: user.email,
            template: "auth.email_verification",
            data: {
              verificationUrl: url,
              token,
            },
          });
          if (!result.success) throw new Error("Email was not accepted.");
        } catch (error) {
          logFailure(error, "auth.verification_email_enqueue");
          throw new APIError("SERVICE_UNAVAILABLE", {
            message:
              "Unable to queue verification email. Please request a new link shortly.",
          });
        }
      },
    },
    databaseHooks: {
      ...(staff
        ? {
            user: {
              update: {
                after: async (identity: {
                  id: string;
                  twoFactorEnabled?: boolean;
                }) => {
                  // Enabling/disabling a factor must invalidate sessions issued before that change.
                  // The plugin subsequently creates a fresh session after successful verification.
                  if (typeof identity.twoFactorEnabled === "boolean")
                    await db
                      .delete(staffSession)
                      .where(eq(staffSession.userId, identity.id));
                },
              },
            },
          }
        : {}),
      session: {
        create: {
          before: async (session) => {
            if (staff) {
              const [membership] = await db
                .select({ id: staffMemberships.id })
                .from(staffMemberships)
                .where(
                  and(
                    eq(staffMemberships.userId, session.userId),
                    eq(staffMemberships.isActive, true),
                  ),
                )
                .limit(1);
              if (membership) return;
              throw new APIError("FORBIDDEN", {
                code: "STAFF_ACCESS_REQUIRED",
                message: "Active staff membership required",
              });
            }
            const [identity] = await db
              .select({ emailVerified: user.emailVerified })
              .from(user)
              .where(eq(user.id, session.userId))
              .limit(1);
            if (identity?.emailVerified) return;

            throw new APIError("FORBIDDEN", {
              code: "EMAIL_NOT_VERIFIED",
              message: "Email not verified",
            });
          },
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // 1 day
      cookieCache: {
        enabled: false,
        maxAge: 5 * 60, // 5 minutes client cache
      },
    },
  });
}

/** Customer identity does not establish merchant access. */
export const auth = createAuth("customer");
export const staffAuth = createAuth("staff");
