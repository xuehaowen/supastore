import { eq, sql } from 'drizzle-orm';
import { db } from '@/infrastructure/db';
import { storeSettings, staffMemberships, auditRecords } from '@/infrastructure/db/schema';
import { ForbiddenError, UnauthorizedError } from '@/application/common/errors';

export interface BootstrapOwnerInput {
  adminSetupSecret: string;
  storeName: string;
  ownerUserId: string;
  ownerEmail: string;
  currency?: string;
  precision?: number;
}

export async function bootstrapOwner(input: BootstrapOwnerInput) {
  const expectedSecret = process.env.ADMIN_SETUP_SECRET;
  if (!expectedSecret || input.adminSetupSecret !== expectedSecret) {
    throw new UnauthorizedError('Invalid admin setup secret.');
  }

  return await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(817234)`);
    // Check if store settings already initialized
    const existing = await tx.select().from(storeSettings).limit(1);

    if (existing.length > 0 && existing[0]!.isBootstrapCompleted) {
      throw new ForbiddenError('Bootstrap setup has already been completed.');
    }

    let storeId: string;

    if (existing.length === 0) {
      const [newStore] = await tx
        .insert(storeSettings)
        .values({
          storeName: input.storeName,
          currency: input.currency ?? 'USD',
          precision: input.precision ?? 2,
          isBootstrapCompleted: true,
          isOrderingEnabled: true,
        })
        .returning();
      storeId = newStore!.id;
    } else {
      const [updatedStore] = await tx
        .update(storeSettings)
        .set({
          storeName: input.storeName,
          currency: input.currency ?? 'USD',
          precision: input.precision ?? 2,
          isBootstrapCompleted: true,
          updatedAt: new Date(),
        })
        .where(eq(storeSettings.id, existing[0]!.id))
        .returning();
      storeId = updatedStore!.id;
    }

    // Insert or activate owner
    const [membership] = await tx
      .insert(staffMemberships)
      .values({
        userId: input.ownerUserId,
        email: input.ownerEmail,
        role: 'owner',
        isActive: true,
      })
      .onConflictDoUpdate({
        target: staffMemberships.userId,
        set: {
          role: 'owner',
          isActive: true,
          updatedAt: new Date(),
        },
      })
      .returning();

    await tx.insert(auditRecords).values({
      entityType: 'store_settings',
      entityId: storeId,
      actorId: input.ownerUserId,
      action: 'store.bootstrap_completed',
      reason: 'Initial system bootstrap completed',
      details: {
        storeName: input.storeName,
        ownerEmail: input.ownerEmail,
      },
    });

    return {
      storeId,
      ownerMembershipId: membership!.id,
      storeName: input.storeName,
      status: 'BOOTSTRAP_COMPLETED',
    };
  });
}
