import { describe, expect, it, vi } from "vitest";
import { auth, staffAuth } from "@/infrastructure/auth";
import * as smtpAdapter from "@/infrastructure/notifications/smtp";
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "@supastore/contracts";

const queries = vi.hoisted(() => ({ limit: vi.fn() }));
vi.mock("@/infrastructure/db", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: queries.limit }) }),
    }),
  },
}));

describe("Auth Module Configuration and Callbacks", () => {
  it("applies the shared password creation policy in both identity realms", () => {
    for (const identity of [auth, staffAuth]) {
      expect(identity.options.emailAndPassword?.minPasswordLength).toBe(
        MIN_PASSWORD_LENGTH,
      );
      expect(identity.options.emailAndPassword?.maxPasswordLength).toBe(
        MAX_PASSWORD_LENGTH,
      );
    }
  });
  it("uses separate staff and customer cookie namespaces and disables staff registration", () => {
    expect(auth.options.advanced?.cookiePrefix).toBe("supastore-customer");
    expect(staffAuth.options.advanced?.cookiePrefix).toBe("supastore-staff");
    expect(staffAuth.options.basePath).toBe("/api/admin-auth");
    expect(staffAuth.options.emailAndPassword?.disableSignUp).toBe(true);
    expect(staffAuth.options.secret).not.toBe(auth.options.secret);
  });
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
      allowed: false,
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
      expect(queries.limit).toHaveBeenCalledTimes(1);
    },
  );

  it.each([true, false])(
    "checks active staff membership independently: %s",
    async (active) => {
      queries.limit.mockReset();
      queries.limit.mockResolvedValue(active ? [{ id: "member" }] : []);
      const result = staffAuth.options.databaseHooks!.session!.create!.before!({
        id: "staff-session",
        userId: "staff-user",
        token: "staff-token",
        expiresAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      if (active) await expect(result).resolves.toBeUndefined();
      else
        await expect(result).rejects.toMatchObject({
          status: "FORBIDDEN",
          body: { code: "STAFF_ACCESS_REQUIRED" },
        });
      expect(queries.limit).toHaveBeenCalledTimes(1);
    },
  );

  it("dispatches verification email with correct link and payload", async () => {
    const sendEmailSpy = vi
      .spyOn(smtpAdapter, "queueAuthEmail")
      .mockResolvedValue({
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
    const sendEmailSpy = vi
      .spyOn(smtpAdapter, "queueAuthEmail")
      .mockResolvedValue({
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
    const sendEmailSpy = vi.spyOn(smtpAdapter, "queueAuthEmail");
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
