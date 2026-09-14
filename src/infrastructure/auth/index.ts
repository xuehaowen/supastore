import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { and, eq } from 'drizzle-orm';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '@/infrastructure/db';
import { staffMemberships, user } from '@/infrastructure/db/schema';
import { smtpAdapter } from '@/infrastructure/notifications/smtp';
import { logger } from '@/infrastructure/security/logger';

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    process.env.APP_URL,
    process.env.BETTER_AUTH_URL,
  ].filter((origin): origin is string => Boolean(origin)),
  database: drizzleAdapter(db, {
    provider: 'pg',
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    autoSignIn: false,
    sendResetPassword: async ({ user, url, token }) => {
      if (process.env.DISABLE_OUTBOUND_DELIVERY === "true") return;
      try {
        await smtpAdapter.sendEmail({
          recipient: user.email,
          subject: 'Reset your password',
          template: 'auth.reset_password',
          data: {
            resetUrl: url,
            recoveryUrl: url,
            token,
          },
        });
      } catch (error) {
        logger.error('Failed to send password reset email.', error);
      }
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url, token }) => {
      if (process.env.DISABLE_OUTBOUND_DELIVERY === "true") return;
      try {
        await smtpAdapter.sendEmail({
          recipient: user.email,
          subject: 'Verify your email address',
          template: 'auth.email_verification',
          data: {
            verificationUrl: url,
            token,
          },
        });
      } catch (error) {
        logger.error('Failed to send verification email.', error);
      }
    },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const [identity] = await db.select({ emailVerified: user.emailVerified })
            .from(user).where(eq(user.id, session.userId)).limit(1);
          if (identity?.emailVerified) return;

          // Only an active, server-managed staff membership exempts verification.
          const [staff] = await db.select({ id: staffMemberships.id })
            .from(staffMemberships)
            .where(and(eq(staffMemberships.userId, session.userId), eq(staffMemberships.isActive, true)))
            .limit(1);
          if (identity && staff) return;

          throw new APIError('FORBIDDEN', {
            code: 'EMAIL_NOT_VERIFIED',
            message: 'Email not verified',
          });
        },
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes client cache
    },
  },
});
