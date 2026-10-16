import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq } from "drizzle-orm";
import { randomBytes, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { db, queryClient } from "@/infrastructure/db";
import {
  user,
  staffSession,
  verification,
  staffMemberships,
} from "@/infrastructure/db/schema";
import { redeemOwnerRecovery } from "@/application/use-cases/staff/redeem-owner-recovery";

describe.skipIf(!process.env.DATABASE_URL?.endsWith("/supastore_test"))(
  "owner recovery with real PostgreSQL",
  () => {
    const userId = randomUUID();
    beforeAll(async () => {
      await migrate(db, {
        migrationsFolder: "apps/backend/src/infrastructure/db/migrations",
      });
      await db.insert(user).values({
        id: userId,
        name: "Recovery owner",
        email: `${userId}@example.test`,
      });
      await db.insert(staffMemberships).values({
        userId,
        email: `${userId}@example.test`,
        role: "owner",
        isActive: true,
      });
    });
    afterAll(async () => {
      await db
        .delete(staffMemberships)
        .where(eq(staffMemberships.userId, userId));
      await db.delete(user).where(eq(user.id, userId));
      await db.delete(verification).where(eq(verification.value, userId));
      vi.unstubAllEnvs();
      await queryClient.end();
    });
    async function token(expiresAt = new Date(Date.now() + 60000)) {
      const value = randomBytes(32).toString("hex");
      await db.insert(verification).values({
        id: randomUUID(),
        identifier: `owner-recovery:${value}`,
        value: userId,
        expiresAt,
      });
      return value;
    }
    it("allows exactly one concurrent redemption and rejects reuse", async () => {
      const value = await token();
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () => redeemOwnerRecovery(value)),
      );
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === "rejected"),
      ).toHaveLength(7);
      expect(
        await db
          .select()
          .from(staffSession)
          .where(eq(staffSession.userId, userId)),
      ).toHaveLength(1);
      await expect(redeemOwnerRecovery(value)).rejects.toThrow(
        "invalid or has expired",
      );
    });
    it("rejects expired tokens", async () => {
      await expect(
        redeemOwnerRecovery(await token(new Date(Date.now() - 1000))),
      ).rejects.toThrow("invalid or has expired");
    });
    it("authenticates the actual recovery cookie through Better Auth", async () => {
      vi.stubEnv(
        "BETTER_AUTH_SECRET",
        "SyntheticRecoveryIntegrationSecret123456789!",
      );
      vi.stubEnv("BETTER_AUTH_URL", "https://recovery.example.test");
      const { GET } = await import("@/app/api/auth/recover-owner/redeem/route");
      const { staffAuth, auth } = await import("@/infrastructure/auth");
      const response = await GET(
        new NextRequest(
          `https://recovery.example.test/api/auth/recover-owner/redeem?token=${await token()}`,
        ),
      );
      expect(new URL(response.headers.get("location")!).pathname).toBe(
        "/admin",
      );
      const context = await staffAuth.$context;
      const cookie = response.cookies.get(
        context.authCookies.sessionToken.name,
      )!;
      expect(cookie).toBeDefined();
      const authenticated = await staffAuth.api.getSession({
        headers: new Headers({
          cookie: `${cookie.name}=${encodeURIComponent(cookie.value)}`,
        }),
      });
      expect(authenticated?.user.id).toBe(userId);
      expect(
        await auth.api.getSession({
          headers: new Headers({
            cookie: `${cookie.name}=${encodeURIComponent(cookie.value)}`,
          }),
        }),
      ).toBeNull();
      const rawToken = cookie.value.slice(0, cookie.value.lastIndexOf("."));
      expect(
        await staffAuth.api.getSession({
          headers: new Headers({ cookie: `${cookie.name}=${rawToken}` }),
        }),
      ).toBeNull();
    });
  },
);
