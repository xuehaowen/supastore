import { describe, expect, it, vi } from "vitest";
import { auth } from "@/infrastructure/auth";
import { smtpAdapter } from "@/infrastructure/notifications/smtp";

describe("Auth Module Configuration and Callbacks", () => {
  it("enforces email verification prior to login", () => {
    expect(auth.options.emailAndPassword?.enabled).toBe(true);
    expect(auth.options.emailAndPassword?.requireEmailVerification).toBe(true);
    expect(auth.options.emailVerification?.sendOnSignUp).toBe(true);
    expect(auth.options.emailVerification?.autoSignInAfterVerification).toBe(true);
  });

  it("dispatches verification email with correct link and payload", async () => {
    const sendEmailSpy = vi.spyOn(smtpAdapter, "sendEmail").mockResolvedValue({
      success: true,
      messageId: "mock-verify-msg-id",
    });

    const sendVerificationEmail =
      auth.options.emailVerification?.sendVerificationEmail;
    expect(sendVerificationEmail).toBeDefined();

    if (sendVerificationEmail) {
      await sendVerificationEmail({
        user: {
          id: "user-123",
          email: "customer@example.com",
          name: "Customer Name",
          emailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        url: "http://localhost:3000/api/auth/verify-email?token=token-123",
        token: "token-123",
      });

      expect(sendEmailSpy).toHaveBeenCalledWith({
        recipient: "customer@example.com",
        subject: "Verify your email address",
        template: "auth.email_verification",
        data: {
          verificationUrl:
            "http://localhost:3000/api/auth/verify-email?token=token-123",
          token: "token-123",
        },
      });
    }

    sendEmailSpy.mockRestore();
  });

  it("dispatches password reset email with correct reset URL", async () => {
    const sendEmailSpy = vi.spyOn(smtpAdapter, "sendEmail").mockResolvedValue({
      success: true,
      messageId: "mock-reset-msg-id",
    });

    const sendResetPassword = auth.options.emailAndPassword?.sendResetPassword;
    expect(sendResetPassword).toBeDefined();

    if (sendResetPassword) {
      await sendResetPassword({
        user: {
          id: "user-456",
          email: "reset-customer@example.com",
          name: "Reset Customer",
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        url: "http://localhost:3000/reset-password?token=reset-token-456",
        token: "reset-token-456",
      });

      expect(sendEmailSpy).toHaveBeenCalledWith({
        recipient: "reset-customer@example.com",
        subject: "Reset your password",
        template: "auth.reset_password",
        data: {
          resetUrl:
            "http://localhost:3000/reset-password?token=reset-token-456",
          recoveryUrl:
            "http://localhost:3000/reset-password?token=reset-token-456",
          token: "reset-token-456",
        },
      });
    }

    sendEmailSpy.mockRestore();
  });

  it("exposes essential customer auth and profile management endpoints", () => {
    const endpoints = auth.api;
    expect(endpoints.signUpEmail).toBeDefined();
    expect(endpoints.signInEmail).toBeDefined();
    expect(endpoints.signOut).toBeDefined();
    expect(endpoints.verifyEmail).toBeDefined();
    expect(endpoints.sendVerificationEmail).toBeDefined();
    expect(endpoints.requestPasswordReset).toBeDefined();
    expect(endpoints.resetPassword).toBeDefined();
    expect(endpoints.changePassword).toBeDefined();
    expect(endpoints.updateUser).toBeDefined();
  });
});
