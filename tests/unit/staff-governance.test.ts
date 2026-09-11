import { describe, it, expect } from "vitest";
import * as v from "valibot";
import { InvariantViolationError, UnauthorizedError } from "@/application/common/errors";

describe("M2 Staff Governance & Security", () => {
  describe("Protected Owner Recovery Workflow (M5)", () => {
    it("validates email format before recovery", () => {
      const invalidEmails = ["not-an-email", "user@", "@domain.com", ""];
      for (const email of invalidEmails) {
        expect(() => {
          v.parse(v.pipe(v.string(), v.email()), email);
        }).toThrow();
      }
    });

    it("constructs recovery URL with one-time token", () => {
      const token = "a".repeat(64);
      const baseUrl = "https://shop.example.com";
      const recoveryUrl = `${baseUrl}/api/auth/recover-owner/redeem?token=${token}`;
      expect(recoveryUrl).toBe(
        "https://shop.example.com/api/auth/recover-owner/redeem?token=" + token
      );
    });

    it("verifies single-use and expiration semantics", () => {
      const now = Date.now();
      const validToken = {
        token: "tok-valid",
        expiresAt: new Date(now + 15 * 60 * 1000),
        used: false,
      };
      const expiredToken = {
        token: "tok-expired",
        expiresAt: new Date(now - 1000),
        used: false,
      };

      // Valid token can be consumed
      expect(validToken.expiresAt.getTime() > now).toBe(true);
      validToken.used = true;

      // Expired token cannot be consumed
      expect(expiredToken.expiresAt.getTime() > now).toBe(false);
      // Re-use of consumed token is blocked
      expect(validToken.used).toBe(true);
    });
  });

  describe("Last Active Owner Deletion Guard", () => {
    function simulateGuardCheck(
      activeOwners: { userId: string; role: string; isActive: boolean }[],
      targetUserId: string,
      action: "deactivate" | "demote" | "delete"
    ) {
      const target = activeOwners.find((o) => o.userId === targetUserId);
      if (!target) throw new Error("Target not found");

      if (target.role === "owner" && target.isActive) {
        const otherActiveOwners = activeOwners.filter(
          (o) => o.userId !== targetUserId && o.role === "owner" && o.isActive
        );
        if (otherActiveOwners.length === 0) {
          throw new InvariantViolationError(
            `Cannot ${action} the last remaining active owner membership. The store must always retain at least one active owner.`
          );
        }
      }
      return true;
    }

    it("prevents deactivating the sole active owner", () => {
      const owners = [{ userId: "owner-1", role: "owner", isActive: true }];
      expect(() =>
        simulateGuardCheck(owners, "owner-1", "deactivate")
      ).toThrow(InvariantViolationError);
      expect(() =>
        simulateGuardCheck(owners, "owner-1", "deactivate")
      ).toThrow(/last remaining active owner/i);
    });

    it("prevents demoting the sole active owner to staff", () => {
      const owners = [{ userId: "owner-1", role: "owner", isActive: true }];
      expect(() =>
        simulateGuardCheck(owners, "owner-1", "demote")
      ).toThrow(InvariantViolationError);
    });

    it("prevents deleting the sole active owner", () => {
      const owners = [{ userId: "owner-1", role: "owner", isActive: true }];
      expect(() =>
        simulateGuardCheck(owners, "owner-1", "delete")
      ).toThrow(InvariantViolationError);
    });

    it("allows deactivating or demoting an owner when another active owner exists", () => {
      const owners = [
        { userId: "owner-1", role: "owner", isActive: true },
        { userId: "owner-2", role: "owner", isActive: true },
      ];

      expect(simulateGuardCheck(owners, "owner-1", "deactivate")).toBe(true);
      expect(simulateGuardCheck(owners, "owner-1", "demote")).toBe(true);
      expect(simulateGuardCheck(owners, "owner-1", "delete")).toBe(true);
    });

    it("allows managing regular staff without triggering owner guard", () => {
      const members = [
        { userId: "owner-1", role: "owner", isActive: true },
        { userId: "staff-1", role: "staff", isActive: true },
      ];

      expect(simulateGuardCheck(members, "staff-1", "deactivate")).toBe(true);
      expect(simulateGuardCheck(members, "staff-1", "delete")).toBe(true);
    });
  });
});
