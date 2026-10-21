import { randomUUID, createHmac } from "node:crypto";
import { betterAuth } from "better-auth";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq } from "drizzle-orm";
import { auth, staffAuth } from "@/infrastructure/auth";
import { db, queryClient } from "@/infrastructure/db";
import { user, staffMemberships } from "@/infrastructure/db/schema";

const email = `mfa-${randomUUID()}@example.test`;
const password = "StaffAuthenticatorPassword123!";
let userId: string;
const jar = new Map<string, string>();
const origin = process.env.STOREFRONT_ORIGIN || "http://localhost:3000";
const cookie = () =>
  [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
async function post(path: string, body: object) {
  const response = await staffAuth.handler(
    new Request(origin + "/api/admin-auth/" + path, {
      method: "POST",
      headers: { origin, cookie: cookie(), "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  for (const value of response.headers.getSetCookie()) {
    const pair = value.split(";")[0]!;
    const index = pair.indexOf("=");
    jar.set(pair.slice(0, index), pair.slice(index + 1));
  }
  return response;
}
function totp(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret]
    .map((c) => alphabet.indexOf(c).toString(2).padStart(5, "0"))
    .join("");
  const key = Buffer.from(
    bits.match(/.{8}/g)!.map((b) => Number.parseInt(b, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac("sha1", key).update(counter).digest();
  return String(
    (hash.readUInt32BE(hash[19]! & 15) & 0x7fffffff) % 1000000,
  ).padStart(6, "0");
}
beforeAll(async () => {
  vi.stubEnv("DISABLE_OUTBOUND_DELIVERY", "true");
  await migrate(db, {
    migrationsFolder: "apps/backend/src/infrastructure/db/migrations",
  });
  const identity = await auth.api.signUpEmail({
    body: { email, password, name: "MFA fixture" },
  });
  userId = identity.user.id;
  await db.update(user).set({ emailVerified: true }).where(eq(user.id, userId));
  await db
    .insert(staffMemberships)
    .values({ userId, email, role: "owner", isActive: true });
});
afterAll(async () => {
  if (userId)
    await db
      .delete(staffMemberships)
      .where(eq(staffMemberships.userId, userId));
  if (userId) await db.delete(user).where(eq(user.id, userId));
  vi.unstubAllEnvs();
  await queryClient.end();
});

it("shares authentication rate counters across independent auth instances", async () => {
  const options = {
    ...staffAuth.options,
    rateLimit: {
      enabled: true,
      storage: "database" as const,
      window: 60,
      max: 100,
      customRules: { "/sign-in/email": { window: 60, max: 2 } },
    },
  };
  const first = betterAuth(options);
  const ip = `198.18.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  const request = () =>
    new Request(origin + "/api/admin-auth/sign-in/email", {
      method: "POST",
      headers: {
        origin,
        "x-forwarded-for": ip,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: `missing-${randomUUID()}@example.test`,
        password,
      }),
    });
  expect((await first.handler(request())).status).toBe(401);
  expect((await first.handler(request())).status).toBe(401);
  const restarted = betterAuth(options);
  expect((await restarted.handler(request())).status).toBe(429);
});

it("enrolls a staff authenticator, revokes old sessions and requires a factor or single-use recovery code", async () => {
  expect((await post("sign-in/email", { email, password })).status).toBe(200);
  const previousCookie = cookie();
  const enabled = await post("two-factor/enable", { password, method: "totp" });
  expect(enabled.status).toBe(200);
  const setup = await enabled.json();
  const secret = new URL(setup.totpURI).searchParams.get("secret")!;
  expect(
    (await post("two-factor/verify-totp", { code: totp(secret) })).status,
  ).toBe(200);
  expect(
    await staffAuth.api.getSession({
      headers: new Headers({ cookie: previousCookie }),
    }),
  ).toBeNull();
  jar.clear();
  const challenge = await post("sign-in/email", { email, password });
  expect((await challenge.json()).twoFactorRedirect).toBe(true);
  expect(
    await staffAuth.api.getSession({
      headers: new Headers({ cookie: cookie() }),
    }),
  ).toBeNull();
  expect((await post("two-factor/verify-totp", { code: "bad" })).ok).toBe(
    false,
  );
  expect(
    (await post("two-factor/verify-totp", { code: totp(secret) })).status,
  ).toBe(200);
  expect(
    (
      await staffAuth.api.getSession({
        headers: new Headers({ cookie: cookie() }),
      })
    )?.user.id,
  ).toBe(userId);
  jar.clear();
  await post("sign-in/email", { email, password });
  expect(
    (
      await post("two-factor/verify-backup-code", {
        code: setup.backupCodes[0],
      })
    ).status,
  ).toBe(200);
  jar.clear();
  await post("sign-in/email", { email, password });
  expect(
    (
      await post("two-factor/verify-backup-code", {
        code: setup.backupCodes[0],
      })
    ).ok,
  ).toBe(false);
  const customer = await auth.api.signInEmail({
    body: { email, password },
    asResponse: true,
  });
  expect(customer.status).toBe(200);
  const customerCookie = customer.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const customerMutation = await auth.handler(
    new Request(origin + "/api/auth/two-factor/disable", {
      method: "POST",
      headers: {
        origin,
        cookie: customerCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ password }),
    }),
  );
  expect(customerMutation.status).toBe(404);
  expect(
    await staffAuth.api.getSession({
      headers: new Headers({ cookie: customerCookie }),
    }),
  ).toBeNull();
  const [protectedIdentity] = await db
    .select({ enabled: user.twoFactorEnabled })
    .from(user)
    .where(eq(user.id, userId));
  expect(protectedIdentity?.enabled).toBe(true);
});
