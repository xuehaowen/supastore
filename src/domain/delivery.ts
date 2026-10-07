import {
  DomainError,
  InvariantViolationError,
} from "@/application/common/errors";
export interface DeliveryArea {
  id: string;
  name: string;
  countryCodes: string[];
  postalPrefixes: string[];
  rateCents: number;
  freeThresholdCents: number | null;
  isActive: boolean;
  weeklySchedule?: Record<string, [string, string][]>;
  prepMinutes?: number;
  scheduleRequired?: boolean;
  slotCapacity?: number | null;
}
export function validateDeliverySchedule(
  value: unknown,
): Record<string, [string, string][]> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new DomainError(
      "Delivery schedule must be an object of weekday time windows.",
    );
  const schedule: Record<string, [string, string][]> = {};
  for (const [day, windows] of Object.entries(value)) {
    if (
      !["mon", "tue", "wed", "thu", "fri", "sat", "sun"].includes(day) ||
      !Array.isArray(windows) ||
      windows.length > 48
    )
      throw new DomainError("Invalid delivery schedule weekday or windows.");
    const entries: [string, string][] = windows.map((window) => {
      if (
        !Array.isArray(window) ||
        window.length !== 2 ||
        window.some(
          (time) =>
            typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time),
        ) ||
        window[0] >= window[1]
      )
        throw new DomainError(
          "Delivery windows must have valid increasing HH:MM times.",
        );
      return [window[0], window[1]];
    });
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    if (
      entries.some(
        (window, index) => index > 0 && window[0] < entries[index - 1]![1],
      )
    )
      throw new DomainError("Delivery windows must not overlap.");
    schedule[day] = entries;
  }
  return schedule;
}
export const normalizePostal = (value: string) =>
  value.trim().toUpperCase().replace(/[\s-]/g, "");
export function validateDeliveryArea(input: Omit<DeliveryArea, "id">) {
  const name = input.name.trim();
  if (!name || name.length > 120)
    throw new DomainError("Delivery area name must contain 1–120 characters.");
  if (
    !input.countryCodes.length ||
    input.countryCodes.length > 250 ||
    input.countryCodes.some((c) => !/^[A-Z]{2}$/.test(c))
  )
    throw new DomainError("Specify valid delivery country codes.");
  if (
    input.postalPrefixes.length > 100 ||
    input.postalPrefixes.some(
      (p) =>
        !normalizePostal(p) || !/^[A-Z0-9]{1,12}$/.test(normalizePostal(p)),
    )
  )
    throw new DomainError(
      "Postal prefixes must contain 1–12 letters or digits.",
    );
  for (const amount of [input.rateCents, input.freeThresholdCents])
    if (
      amount !== null &&
      (!Number.isSafeInteger(amount) || amount < 0 || amount > 2147483647)
    )
      throw new DomainError(
        "Delivery amounts must be nonnegative minor currency units.",
      );
  if (typeof input.isActive !== "boolean")
    throw new DomainError("Invalid delivery area status.");
  const weeklySchedule = validateDeliverySchedule(input.weeklySchedule || {});
  const prepMinutes = input.prepMinutes ?? 0;
  const scheduleRequired = input.scheduleRequired ?? false;
  const slotCapacity = input.slotCapacity ?? null;
  if (
    !Number.isInteger(prepMinutes) ||
    prepMinutes < 0 ||
    prepMinutes > 525600 ||
    typeof scheduleRequired !== "boolean" ||
    (slotCapacity !== null &&
      (!Number.isInteger(slotCapacity) ||
        slotCapacity < 0 ||
        slotCapacity > 2147483647))
  )
    throw new DomainError("Invalid delivery preparation time or capacity.");
  if (
    scheduleRequired &&
    !Object.values(weeklySchedule).some((windows) => windows.length)
  )
    throw new DomainError(
      "Scheduled delivery requires at least one weekly delivery window.",
    );
  return {
    ...input,
    name,
    countryCodes: [...new Set(input.countryCodes)],
    postalPrefixes: [...new Set(input.postalPrefixes.map(normalizePostal))],
    weeklySchedule,
    prepMinutes,
    scheduleRequired,
    slotCapacity,
  };
}
export function quoteDelivery(
  area: DeliveryArea | undefined,
  country: string,
  postalCode: string,
  subtotalCents: number,
) {
  const countryCode = country.trim().toUpperCase();
  const postal = normalizePostal(postalCode);
  if (
    !area?.isActive ||
    !area.countryCodes.includes(countryCode) ||
    !postal ||
    !/^[A-Z0-9]{1,12}$/.test(postal) ||
    (area.postalPrefixes.length &&
      !area.postalPrefixes.some((prefix) =>
        postal.startsWith(normalizePostal(prefix)),
      ))
  )
    throw new InvariantViolationError(
      "Local delivery is not available to this destination.",
    );
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents < 0)
    throw new DomainError("Invalid merchandise subtotal.");
  return {
    areaId: area.id,
    name: area.name,
    country: countryCode,
    postalCode: postal,
    rateCents:
      area.freeThresholdCents !== null &&
      subtotalCents >= area.freeThresholdCents
        ? 0
        : area.rateCents,
  };
}
