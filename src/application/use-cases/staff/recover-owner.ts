import { eq, sql } from "drizzle-orm";
import { randomBytes, randomUUID } from "node:crypto";
import * as v from "valibot";
import { db } from "@/infrastructure/db";
import {
  user,
  staffMemberships,
  verification,
  auditRecords,
} from "@/infrastructure/db/schema";
import { DomainError } from "@/application/common/errors";

const EmailSchema = v.pipe(
  v.string(),
  v.email("A valid email address is required.")
);

export interface RecoverOwnerInput {
  email: string;
  baseUrl?: string;
}

export interface RecoverOwnerOutput {
  userId: string;
  email: string;
  recoveryToken: string;
  recoveryUrl: string;
  expiresAt: Date;
}

/**
 * Protected CLI-based owner recovery workflow (M5).
 * Grants or restores active owner access for the specified email and generates
 * a single-use temporary recovery login URL.
 */
export async function recoverOwner(
  input: RecoverOwnerInput
): Promise<RecoverOwnerOutput> {
  const email = v.parse(EmailSchema, input.email.trim().toLowerCase());
  const baseUrl = (
    input.baseUrl ||
    process.env.BETTER_AUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");

  return await db.transaction(async (tx) => {
    // Acquire advisory transaction lock for staff governance
    await tx.execute(sql`select pg_advisory_xact_lock(817235)`);

    // 1. Find or create user
    const existingUsers = await tx
      .select()
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    let targetUserId: string;

    if (existingUsers.length > 0) {
      targetUserId = existingUsers[0]!.id;
      await tx
        .update(user)
        .set({ emailVerified: true, updatedAt: new Date() })
        .where(eq(user.id, targetUserId));
    } else {
      targetUserId = randomUUID();
      const userName = email.split("@")[0] || "Owner";
      await tx.insert(user).values({
        id: targetUserId,
        name: userName,
        email,
        emailVerified: true,
      });
    }

    // 2. Promote or restore staff membership as active owner
    const [membership] = await tx
      .insert(staffMemberships)
      .values({
        userId: targetUserId,
        email,
        role: "owner",
        isActive: true,
      })
      .onConflictDoUpdate({
        target: staffMemberships.userId,
        set: {
          role: "owner",
          isActive: true,
          updatedAt: new Date(),
        },
      })
      .returning();

    // 3. Generate secure single-use recovery token (15 min validity)
    const recoveryToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await tx.insert(verification).values({
      id: randomUUID(),
      identifier: `owner-recovery:${recoveryToken}`,
      value: targetUserId,
      expiresAt,
    });

    // 4. Audit logging
    await tx.insert(auditRecords).values({
      entityType: "staff_memberships",
      entityId: membership!.id,
      actorId: "cli:auth:recover-owner",
      action: "staff.owner_recovered",
      reason: "Owner access restored via protected server CLI command",
      details: {
        email,
        userId: targetUserId,
      },
    });

    const recoveryUrl = `${baseUrl}/api/auth/recover-owner/redeem?token=${recoveryToken}`;

    return {
      userId: targetUserId,
      email,
      recoveryToken,
      recoveryUrl,
      expiresAt,
    };
  });
}
