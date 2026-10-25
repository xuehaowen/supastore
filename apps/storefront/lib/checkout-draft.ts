import type { CheckoutDefaults } from "../app/checkout-state";

export const CHECKOUT_DRAFT_PREFIX = "store-checkout-draft:";
export const CHECKOUT_PLACEMENT_PREFIX = "store-checkout-placement:";
export const CHECKOUT_DRAFT_TTL = 30 * 60 * 1000;
const fields = [
  "fulfillmentType",
  "address",
  "recipientName",
  "line2",
  "city",
  "country",
  "region",
  "postalCode",
  "pickupLocationId",
  "deliveryAreaId",
  "promotionCode",
] as const satisfies readonly (keyof CheckoutDefaults)[];

export function checkoutDraftKey(cartId: string, owner: string) {
  return `${CHECKOUT_DRAFT_PREFIX}${encodeURIComponent(cartId)}:${encodeURIComponent(owner)}`;
}

export function checkoutDraftFields(data: FormData): CheckoutDefaults {
  const result: CheckoutDefaults = {};
  for (const field of fields) {
    const value = data.get(field);
    if (typeof value === "string" && value.length <= 500) result[field] = value;
  }
  return result;
}

export function readCheckoutDraft(
  storage: Pick<Storage, "getItem" | "removeItem">,
  key: string,
  now = Date.now(),
): CheckoutDefaults | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (
      draft?.version !== 1 ||
      !Number.isFinite(draft.savedAt) ||
      draft.savedAt > now ||
      now - draft.savedAt >= CHECKOUT_DRAFT_TTL ||
      !draft.fields ||
      typeof draft.fields !== "object" ||
      Array.isArray(draft.fields)
    ) {
      storage.removeItem(key);
      return null;
    }
    const data = new FormData();
    for (const field of fields) {
      if (typeof draft.fields[field] === "string")
        data.set(field, draft.fields[field]);
    }
    return checkoutDraftFields(data);
  } catch {
    return null;
  }
}

export function saveCheckoutDraft(
  storage: Pick<Storage, "setItem">,
  key: string,
  data: FormData,
) {
  try {
    storage.setItem(
      key,
      JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        fields: checkoutDraftFields(data),
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function consumeCheckoutDraft(
  storage: Storage,
  token: string,
  now = Date.now(),
) {
  const markerKey = CHECKOUT_PLACEMENT_PREFIX + token;
  try {
    const raw = storage.getItem(markerKey);
    if (!raw) return;
    storage.removeItem(markerKey);
    const marker = JSON.parse(raw);
    if (
      typeof marker.key !== "string" ||
      !marker.key.startsWith(CHECKOUT_DRAFT_PREFIX) ||
      !Number.isFinite(marker.placedAt) ||
      marker.placedAt > now ||
      now - marker.placedAt >= CHECKOUT_DRAFT_TTL
    )
      return;
    const draft = JSON.parse(storage.getItem(marker.key) || "null");
    if (draft && draft.savedAt <= marker.placedAt)
      storage.removeItem(marker.key);
  } catch {
    /* Confirmation must remain usable without browser storage. */
  }
}
