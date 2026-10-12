import { InvariantViolationError } from "@/domain/errors";
import { validShippingRegion } from "@/domain/shipping-destination";
export function shippingPrice(
  zones: {
    countryCodes: string[] | null;
    regionCodes?: string[];
    postalPrefixes?: string[];
    rateCents: number;
    freeThresholdCents: number | null;
  }[],
  country: string,
  subtotal: number,
  destination: { region?: string; postalCode?: string } = {},
) {
  const candidates = zones.filter(
    (z) => z.countryCodes === null || z.countryCodes.includes(country),
  );
  const region = destination.region?.trim().toUpperCase() ?? "";
  const postal = normalizeShippingPostal(destination.postalCode ?? "");
  if (region && !validShippingRegion(country, region))
    throw new InvariantViolationError("Enter a valid state or region code.");
  if (postal && !/^[A-Z0-9]{1,12}$/.test(postal))
    throw new InvariantViolationError("Enter a valid ZIP or postal code.");
  if (candidates.some((z) => z.regionCodes?.length) && !region)
    throw new InvariantViolationError("Enter your state or region.");
  if (candidates.some((z) => z.postalPrefixes?.length) && !postal)
    throw new InvariantViolationError("Enter your ZIP or postal code.");
  // More specific rules win. Equal specificity retains the configured order.
  const matches = candidates.filter(
    (z) =>
      (!z.regionCodes?.length || z.regionCodes.includes(region)) &&
      (!z.postalPrefixes?.length ||
        z.postalPrefixes.some((p) => postal.startsWith(p))),
  );
  const specificity = (z: (typeof zones)[number]) =>
    (z.postalPrefixes?.length ? 4 : 0) +
    (z.regionCodes?.length ? 2 : 0) +
    (z.countryCodes === null ? 0 : 1);
  const zone = matches.sort((a, b) => specificity(b) - specificity(a))[0];
  if (!zone)
    throw new InvariantViolationError("We do not ship to this destination.");
  return zone.freeThresholdCents !== null && subtotal >= zone.freeThresholdCents
    ? 0
    : zone.rateCents;
}
export function normalizeShippingPostal(value: string) {
  return value.trim().toUpperCase().replace(/[\s-]/g, "");
}
export function validatePickup(
  location: {
    weeklySchedule: Record<string, [string, string][]>;
    blackoutDates: string[];
    prepMinutes: number;
  },
  date: string,
  start: string,
  timezone: string,
  now: Date,
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(start)
  )
    throw new InvariantViolationError("Choose a valid pickup date and time.");
  const day = new Date(date + "T12:00:00Z");
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== date)
    throw new InvariantViolationError("Invalid pickup date.");
  const weekday = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][
    day.getUTCDay()
  ]!;
  const slot = location.weeklySchedule[weekday]?.find(
    ([from]) => from === start,
  );
  const earliest = new Date(now.getTime() + location.prepMinutes * 60000);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(earliest)
      .map((p) => [p.type, p.value]),
  );
  const earliestLocal = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  if (
    !slot ||
    location.blackoutDates.includes(date) ||
    `${date}T${start}` < earliestLocal
  )
    throw new InvariantViolationError(
      "This pickup slot is closed, past, or does not allow enough preparation time.",
    );
  return { date, startTime: slot[0], endTime: slot[1] };
}
