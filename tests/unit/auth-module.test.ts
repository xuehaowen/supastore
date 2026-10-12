import { describe, expect, it, vi } from "vitest";
import { auth } from "@/infrastructure/auth";
import { smtpAdapter } from "@/infrastructure/notifications/smtp";

const queries = vi.hoisted(() => ({ limit: vi.fn() }));
vi.mock("@/infrastructure/db", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: queries.limit }) }),
    }),
  },
}));

describe("Auth Module Configuration and Callbacks", () => {
  it("keeps customer signup verification without globally blocking staff login", () => {
    expect(auth.options.emailAndPassword?.enabled).toBe(true);
    expect(auth.options.emailAndPassword?.requireEmailVerification).toBe(false);
    expect(auth.options.emailAndPassword?.autoSignIn).toBe(false);
    expect(auth.options.emailVerification?.sendOnSignUp).toBe(true);
    expect(auth.options.emailVerification?.autoSignInAfterVerification).toBe(
      true,
    );
  });

  it.each([
    { label: "verified customer", verified: true, staff: false, allowed: true },
    {
      label: "unverified active staff",
      verified: false,
      staff: true,
      allowed: true,
    },
    {
      label: "unverified customer",
      verified: false,
      staff: false,
      allowed: false,
    },
    {
      label: "unverified inactive staff",
      verified: false,
      staff: false,
      allowed: false,
    },
  ])(
    "checks session creation for $label",
    async ({ verified, staff, allowed }) => {
      queries.limit.mockReset();
      queries.limit.mockResolvedValueOnce([{ emailVerified: verified }]);
      if (!verified)
        queries.limit.mockResolvedValueOnce(
          staff ? [{ id: "membership" }] : [],
        );
      const before = auth.options.databaseHooks!.session!.create!.before!;
      const result = before({
        id: "session",
        userId: "user",
        token: "token",
        expiresAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      if (allowed) await expect(result).resolves.toBeUndefined();
      else
        await expect(result).rejects.toMatchObject({
          status: "FORBIDDEN",
          body: { code: "EMAIL_NOT_VERIFIED" },
        });
      expect(queries.limit).toHaveBeenCalledTimes(verified ? 1 : 2);
    },
  );

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

  it("suppresses verification delivery when outbound delivery is disabled", async () => {
    const sendEmailSpy = vi.spyOn(smtpAdapter, "sendEmail");
    const previous = process.env.DISABLE_OUTBOUND_DELIVERY;
    process.env.DISABLE_OUTBOUND_DELIVERY = "true";
    try {
      const sendVerificationEmail =
        auth.options.emailVerification?.sendVerificationEmail;
      await sendVerificationEmail?.({
        user: {
          id: "user-disabled",
          email: "disabled@example.com",
          name: "Disabled",
          emailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        url: "http://localhost/verify",
        token: "token-disabled",
      });
      expect(sendEmailSpy).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.DISABLE_OUTBOUND_DELIVERY;
      else process.env.DISABLE_OUTBOUND_DELIVERY = previous;
      sendEmailSpy.mockRestore();
    }
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
