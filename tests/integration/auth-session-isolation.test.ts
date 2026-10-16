import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { auth, staffAuth } from "@/infrastructure/auth";
import { db, queryClient } from "@/infrastructure/db";
import { user, staffMemberships, session, staffSession } from "@/infrastructure/db/schema";

describe.skipIf(!process.env.DATABASE_URL?.endsWith("/supastore_test"))("staff and customer session isolation", () => {
  const email = `isolated-${randomUUID()}@example.test`;
  const password = "SessionIsolationPassword123!";
  let userId: string;
  beforeAll(async () => {
    vi.stubEnv("DISABLE_OUTBOUND_DELIVERY", "true");
    await migrate(db, { migrationsFolder: "apps/backend/src/infrastructure/db/migrations" });
    const created = await auth.api.signUpEmail({ body: { email, password, name: "Isolated owner" } });
    userId = created.user.id;
    await db.update(user).set({ emailVerified: true }).where(eq(user.id, userId));
    await db.insert(staffMemberships).values({ userId, email, role: "owner", isActive: true });
  });
  afterAll(async () => {
    if (userId) {
      await db.delete(staffMemberships).where(eq(staffMemberships.userId, userId));
      await db.delete(user).where(eq(user.id, userId));
    }
    vi.unstubAllEnvs();
    await queryClient.end();
  });

  it("keeps cookies, persisted sessions, listing and logout independent even for the same user", async () => {
    const staffResponse = await staffAuth.api.signInEmail({ body: { email, password }, asResponse: true });
    const customerResponse = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
    expect(staffResponse.status).toBe(200);
    expect(customerResponse.status).toBe(200);
    const staffCookie = staffResponse.headers.getSetCookie().find(value => value.includes(".session_token="))!.split(";")[0]!;
    const customerCookie = customerResponse.headers.getSetCookie().find(value => value.includes(".session_token="))!.split(";")[0]!;
    expect(staffCookie.split("=")[0]).not.toBe(customerCookie.split("=")[0]);
    const staffHeaders = new Headers({ cookie: staffCookie });
    const customerHeaders = new Headers({ cookie: customerCookie });
    expect((await staffAuth.api.getSession({ headers: staffHeaders }))?.user.id).toBe(userId);
    expect(await auth.api.getSession({ headers: staffHeaders })).toBeNull();
    expect((await auth.api.getSession({ headers: customerHeaders }))?.user.id).toBe(userId);
    expect(await staffAuth.api.getSession({ headers: customerHeaders })).toBeNull();
    expect(await auth.api.getSession({ headers: new Headers({ cookie: `${customerCookie.split("=")[0]}=${staffCookie.slice(staffCookie.indexOf("=")+1)}` }) })).toBeNull();
    expect(await staffAuth.api.getSession({ headers: new Headers({ cookie: `${staffCookie.split("=")[0]}=${customerCookie.slice(customerCookie.indexOf("=")+1)}` }) })).toBeNull();
    expect(await db.select().from(session).where(eq(session.userId,userId))).toHaveLength(1);
    expect(await db.select().from(staffSession).where(eq(staffSession.userId,userId))).toHaveLength(1);
    expect(await auth.api.listSessions({ headers: customerHeaders })).toHaveLength(1);
    expect(await staffAuth.api.listSessions({ headers: staffHeaders })).toHaveLength(1);
    await auth.api.signOut({ headers: customerHeaders });
    expect(await auth.api.getSession({ headers: customerHeaders })).toBeNull();
    expect((await staffAuth.api.getSession({ headers: staffHeaders }))?.user.id).toBe(userId);
    const freshCustomer = await auth.api.signInEmail({ body:{email,password}, asResponse:true });
    const freshCookie = freshCustomer.headers.getSetCookie().find(value=>value.includes(".session_token="))!.split(";")[0]!;
    await staffAuth.api.signOut({ headers: staffHeaders });
    expect(await staffAuth.api.getSession({ headers: staffHeaders })).toBeNull();
    expect((await auth.api.getSession({ headers:new Headers({cookie:freshCookie}) }))?.user.id).toBe(userId);
  });

  it("rejects customer-only or revoked memberships at staff sign-in", async () => {
    await db.update(staffMemberships).set({isActive:false}).where(eq(staffMemberships.userId,userId));
    await expect(staffAuth.api.signInEmail({body:{email,password}})).rejects.toMatchObject({status:"FORBIDDEN"});
    expect(await db.select().from(staffSession).where(eq(staffSession.userId,userId))).toHaveLength(0);
  });
});
