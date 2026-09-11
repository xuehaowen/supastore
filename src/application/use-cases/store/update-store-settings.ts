import { eq, sql } from 'drizzle-orm';
import * as v from 'valibot';
import { db } from '@/infrastructure/db';
import { storeSettings, orders, auditRecords } from '@/infrastructure/db/schema';
import { verifyStaffInTransaction } from '@/infrastructure/auth/session';
import { InvariantViolationError, NotFoundError } from '@/application/common/errors';
const schema = v.object({
  storeName: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120))),
  logoKey: v.optional(v.string()),
  supportEmail: v.optional(v.pipe(v.string(), v.email())),
  currency: v.optional(v.pipe(v.string(), v.regex(/^[A-Z]{3}$/))),
  precision: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(4))),
  defaultLocale: v.optional(v.picklist(['en', 'zh'])),
  timezone: v.optional(v.string()),
  isOrderingEnabled: v.optional(v.boolean()),
  isPaused: v.optional(v.boolean()),
  pauseMessage: v.optional(v.pipe(v.string(), v.maxLength(500))),
  taxRateBasisPoints: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10000))),
  isTaxInclusive: v.optional(v.boolean()),
  setupCompleted: v.optional(v.boolean()),
});
export type UpdateStoreSettingsInput = v.InferInput<typeof schema> & { staffUserId: string };
export async function updateStoreSettings(input: UpdateStoreSettingsInput) {
  const parsed = v.parse(schema, input);
  if (parsed.timezone) new Intl.DateTimeFormat('en', { timeZone: parsed.timezone }).format();
  return db.transaction(async tx => {
    await verifyStaffInTransaction(tx, input.staffUserId, 'owner');
    const [settings] = await tx.select().from(storeSettings).for('update').limit(1);
    if (!settings) throw new NotFoundError('Complete owner bootstrap first.');
    if ((parsed.currency && parsed.currency !== settings.currency) || (parsed.precision !== undefined && parsed.precision !== settings.precision)) {
      if ((await tx.select({ id: orders.id }).from(orders).limit(1)).length) throw new InvariantViolationError('Currency cannot change after the first order.');
    }
    const [updated] = await tx.update(storeSettings).set({ ...parsed, quoteVersion: ['currency','precision','taxRateBasisPoints','isTaxInclusive','timezone'].some(key => key in parsed) ? sql`${storeSettings.quoteVersion} + 1` : settings.quoteVersion, updatedAt: new Date() }).where(eq(storeSettings.id, settings.id)).returning();
    await tx.insert(auditRecords).values({ entityType: 'store', entityId: settings.id, actorId: input.staffUserId, action: 'store.settings_updated', details: parsed });
    return updated!;
  });
}

