import { DomainError } from "@/domain/errors";

export const ORDER_SORTS = {
  createdAt: "Creation time",
  pickupLocation: "Pickup location",
  pickupTime: "Pickup time",
  customer: "Customer",
  total: "Total",
} as const;

export const ORDER_FILTER_KEYS = [
  "customer",
  "pickupLocation",
  "pickupFrom",
  "pickupTo",
  "createdFrom",
  "createdTo",
  "minTotal",
  "maxTotal",
  "fulfillmentType",
  "sort",
  "direction",
  "pickupTimeFrom",
  "pickupTimeTo",
] as const;
export type OrderFilters = Partial<
  Record<(typeof ORDER_FILTER_KEYS)[number], string>
>;

export function parseOrderFilters(parameters: URLSearchParams): OrderFilters {
  const result: OrderFilters = {};
  for (const key of ORDER_FILTER_KEYS) {
    const value = parameters.get(key)?.trim();
    if (!value) continue;
    let valid = true;
    if (key === "customer" || key === "pickupLocation")
      valid = value.length <= 120;
    else if (
      ["pickupFrom", "pickupTo", "createdFrom", "createdTo"].includes(key)
    )
      valid =
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        Number.isFinite(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 10) === value;
    else if (key === "pickupTimeFrom" || key === "pickupTimeTo")
      valid = /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
    else if (key === "minTotal" || key === "maxTotal")
      valid = /^\d{1,10}(?:\.\d{1,6})?$/.test(value);
    else if (key === "sort") valid = Object.hasOwn(ORDER_SORTS, value);
    else if (key === "direction") valid = ["asc", "desc"].includes(value);
    else if (key === "fulfillmentType")
      valid = ["shipping", "pickup", "local_delivery"].includes(value);
    if (!valid) throw new DomainError("Choose valid order filters.");
    result[key] = value;
  }
  if (
    (result.pickupTimeFrom &&
      result.pickupTimeTo &&
      result.pickupTimeFrom > result.pickupTimeTo) ||
    (result.createdFrom &&
      result.createdTo &&
      result.createdFrom > result.createdTo) ||
    (result.pickupFrom &&
      result.pickupTo &&
      result.pickupFrom > result.pickupTo) ||
    (result.minTotal &&
      result.maxTotal &&
      Number(result.minTotal) > Number(result.maxTotal))
  )
    throw new DomainError(
      "The start of each filter range must not exceed its end.",
    );
  return result;
}
