import * as v from "valibot";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { storeSettings } from "@/infrastructure/db/schema";
import { eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  auditRecords,
  shippingZones,
  pickupLocation,
} from "@/infrastructure/db/schema";
import { parseActionRequiredText } from "@/application/common/request-validation";
import { DomainError, NotFoundError } from "@/application/common/errors";
import { updateConfiguredSlotCapacity } from "./slot-capacity";
import { normalizeShippingPostal } from "@/domain/checkout";
import { validShippingRegion } from "@supastore/shipping/destination";

export interface ShippingZoneInput {
  id?: string;
  name: string;
  countryCodes?: string[] | null;
  regionCodes?: string[];
  postalPrefixes?: string[];
  rateCents: number;
  freeThresholdCents?: number | null;
  sortOrder?: number;
}

export interface PickupLocationInput {
  id?: string;
  name: string;
  address: string;
  weeklySchedule: Record<string, [string, string][]>;
  blackoutDates?: string[];
  prepMinutes?: number;
  slotCapacity?: number | null;
  scheduleRequired?: boolean;
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
    parseActionRequiredText(zone.name, "Shipping zone name", 120);
    v.parse(amount, zone.rateCents);
    if (zone.sortOrder !== undefined) v.parse(amount, zone.sortOrder);
    if (
      (zone.regionCodes?.length ?? 0) > 250 ||
      (zone.postalPrefixes?.length ?? 0) > 100
    )
      throw new DomainError(
        "Use at most 250 regions and 100 postal prefixes per zone.",
      );
    if (zone.freeThresholdCents != null)
      v.parse(amount, zone.freeThresholdCents);
    for (const country of zone.countryCodes ?? [])
      v.parse(v.pipe(v.string(), v.regex(/^[A-Z]{2}$/)), country);
    for (const region of zone.regionCodes ?? [])
      if (!validShippingRegion(zone.countryCodes?.[0] ?? "", region))
        throw new DomainError(
          "Specify valid state or region codes (for US, use CA, NY, etc.).",
        );
    for (const prefix of zone.postalPrefixes ?? [])
      v.parse(
        v.pipe(v.string(), v.regex(/^[A-Z0-9]{1,12}$/)),
        normalizeShippingPostal(prefix),
      );
    if (
      (zone.regionCodes?.length || zone.postalPrefixes?.length) &&
      zone.countryCodes?.length !== 1
    )
      throw new DomainError(
        "Regional shipping zones must specify exactly one country.",
      );
  }
  if (pickup) {
    parseActionRequiredText(pickup.name, "Pickup location name", 120);
    parseActionRequiredText(pickup.address, "Pickup address", 1000);
    v.parse(amount, pickup.prepMinutes ?? 60);
    if (pickup.slotCapacity != null) v.parse(amount, pickup.slotCapacity);
    if (pickup.scheduleRequired !== undefined)
      v.parse(v.boolean(), pickup.scheduleRequired);
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
      for (const [idx, zone] of zones.entries()) {
        if (zone.id) {
          const [updated] = await tx
            .update(shippingZones)
            .set({
              name: zone.name,
              countryCodes: zone.countryCodes ?? null,
              regionCodes: [...new Set(zone.regionCodes ?? [])],
              postalPrefixes: [
                ...new Set(
                  (zone.postalPrefixes ?? []).map(normalizeShippingPostal),
                ),
              ],
              rateCents: zone.rateCents,
              freeThresholdCents: zone.freeThresholdCents ?? null,
              sortOrder: zone.sortOrder ?? idx,
              updatedAt: new Date(),
            })
            .where(eq(shippingZones.id, zone.id))
            .returning();
          if (!updated) throw new NotFoundError("Shipping zone not found.");
          savedZones.push(updated);
        } else {
          const [created] = await tx
            .insert(shippingZones)
            .values({
              name: zone.name,
              countryCodes: zone.countryCodes ?? null,
              regionCodes: [...new Set(zone.regionCodes ?? [])],
              postalPrefixes: [
                ...new Set(
                  (zone.postalPrefixes ?? []).map(normalizeShippingPostal),
                ),
              ],
              rateCents: zone.rateCents,
              freeThresholdCents: zone.freeThresholdCents ?? null,
              sortOrder: zone.sortOrder ?? idx,
            })
            .returning();
          savedZones.push(created!);
        }
      }
      await tx.insert(auditRecords).values({
        entityType: "store",
        entityId: (
          await tx.select({ id: storeSettings.id }).from(storeSettings).limit(1)
        )[0]!.id,
        actorId: input.staffUserId,
        action: "shipping.zones_saved",
        details: { zoneIds: savedZones.map((zone) => zone.id) },
      });
    } else {
      savedZones = await tx
        .select()
        .from(shippingZones)
        .orderBy(shippingZones.sortOrder);
    }

    let savedPickup: typeof pickupLocation.$inferSelect | null = null;
    if (pickup !== undefined) {
      const [existingPickup] = pickup.id
        ? await tx
            .select()
            .from(pickupLocation)
            .where(eq(pickupLocation.id, pickup.id))
        : [];
      if (pickup.id && !existingPickup)
        throw new NotFoundError("Pickup location not found.");
      if (existingPickup) {
        await updateConfiguredSlotCapacity(
          tx,
          { pickupLocationId: existingPickup.id },
          pickup.slotCapacity === undefined
            ? existingPickup.slotCapacity
            : pickup.slotCapacity,
        );
        const [updated] = await tx
          .update(pickupLocation)
          .set({
            name: pickup.name,
            address: pickup.address,
            weeklySchedule: pickup.weeklySchedule,
            blackoutDates: pickup.blackoutDates ?? existingPickup.blackoutDates,
            prepMinutes: pickup.prepMinutes ?? 60,
            slotCapacity:
              pickup.slotCapacity === undefined
                ? existingPickup.slotCapacity
                : pickup.slotCapacity,
            scheduleRequired:
              pickup.scheduleRequired ?? existingPickup.scheduleRequired,
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
            slotCapacity: pickup.slotCapacity ?? null,
            scheduleRequired: pickup.scheduleRequired ?? true,
          })
          .returning();
        savedPickup = created;
      }
      await tx.insert(auditRecords).values({
        entityType: "pickup_location",
        entityId: savedPickup!.id,
        actorId: input.staffUserId,
        action: existingPickup ? "updated" : "created",
        details: { name: savedPickup!.name },
      });
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
