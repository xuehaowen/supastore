import * as v from "valibot";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { storeSettings } from "@/infrastructure/db/schema";
import { eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import { shippingZones, pickupLocation } from "@/infrastructure/db/schema";

export interface ShippingZoneInput {
  id?: string;
  name: string;
  countryCodes?: string[] | null;
  rateCents: number;
  freeThresholdCents?: number | null;
  sortOrder?: number;
}

export interface PickupLocationInput {
  name: string;
  address: string;
  weeklySchedule: Record<string, [string, string][]>;
  blackoutDates?: string[];
  prepMinutes?: number;
}

export interface ConfigureShippingInput {
  staffUserId: string;
  zones?: ShippingZoneInput[];
  pickup?: PickupLocationInput;
}

export async function configureShipping(input: ConfigureShippingInput) {
  const { zones, pickup } = input;
  const amount = v.pipe(
    v.number(),
    v.integer(),
    v.minValue(0),
    v.maxValue(2147483647),
  );
  for (const zone of zones ?? []) {
    v.parse(amount, zone.rateCents);
    if (zone.freeThresholdCents != null)
      v.parse(amount, zone.freeThresholdCents);
    for (const country of zone.countryCodes ?? [])
      v.parse(v.pipe(v.string(), v.regex(/^[A-Z]{2}$/)), country);
  }
  if (pickup) {
    v.parse(amount, pickup.prepMinutes ?? 60);
    for (const [day, slots] of Object.entries(pickup.weeklySchedule)) {
      if (!["mon", "tue", "wed", "thu", "fri", "sat", "sun"].includes(day))
        throw new Error("Invalid weekday");
      for (const [start, end] of slots) {
        const time = v.pipe(
          v.string(),
          v.regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/),
        );
        v.parse(time, start);
        v.parse(time, end);
        if (start >= end) throw new Error("Pickup start must precede end");
      }
    }
  }

  return await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.staffUserId, "owner");
    await tx.select().from(storeSettings).for("update");
    await tx
      .update(storeSettings)
      .set({ quoteVersion: sql`${storeSettings.quoteVersion} + 1` });
    let savedZones: Array<typeof shippingZones.$inferSelect> = [];
    if (zones !== undefined) {
      // Replace or update zones
      await tx.delete(shippingZones);
      if (zones.length > 0) {
        savedZones = await tx
          .insert(shippingZones)
          .values(
            zones.map((z, idx) => ({
              name: z.name,
              countryCodes: z.countryCodes ?? null,
              rateCents: z.rateCents,
              freeThresholdCents: z.freeThresholdCents ?? null,
              sortOrder: z.sortOrder ?? idx,
            })),
          )
          .returning();
      }
    } else {
      savedZones = await tx
        .select()
        .from(shippingZones)
        .orderBy(shippingZones.sortOrder);
    }

    let savedPickup: typeof pickupLocation.$inferSelect | null = null;
    if (pickup !== undefined) {
      const [existingPickup] = await tx.select().from(pickupLocation).limit(1);
      if (existingPickup) {
        const [updated] = await tx
          .update(pickupLocation)
          .set({
            name: pickup.name,
            address: pickup.address,
            weeklySchedule: pickup.weeklySchedule,
            blackoutDates: pickup.blackoutDates ?? [],
            prepMinutes: pickup.prepMinutes ?? 60,
            updatedAt: new Date(),
          })
          .where(eq(pickupLocation.id, existingPickup.id))
          .returning();
        savedPickup = updated;
      } else {
        const [created] = await tx
          .insert(pickupLocation)
          .values({
            name: pickup.name,
            address: pickup.address,
            weeklySchedule: pickup.weeklySchedule,
            blackoutDates: pickup.blackoutDates ?? [],
            prepMinutes: pickup.prepMinutes ?? 60,
          })
          .returning();
        savedPickup = created;
      }
    } else {
      const [loc] = await tx.select().from(pickupLocation).limit(1);
      savedPickup = loc ?? null;
    }

    return {
      zones: savedZones,
      pickup: savedPickup,
    };
  });
}
