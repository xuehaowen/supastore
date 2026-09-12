import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '@/infrastructure/db';
import { smtpAdapter } from '@/infrastructure/notifications/smtp';

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: 'pg',
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url, token }) => {
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
        console.error('Failed to send password reset email:', error);
      }
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url, token }) => {
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
        console.error('Failed to send verification email:', error);
      }
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
