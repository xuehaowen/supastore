import { describe, expect, it } from "vitest";
import { parseStoreDto, parseProductDto, parseCartDto, parseCustomerAccountDto, parseCatalogDto, parseOrderDetailDto, parsePaymentCheckoutDto, parseUploadIntentDto, parseRecoveryOrderDto } from "../../packages/contracts/src";

const store = {
  storeName: "Fixture", currency: "USD", precision: 2, supportEmail: "owner@example.test",
  isPaused: false, pauseMessage: null, isOrderingEnabled: true,
  categories: [], paymentMethods: [], pickupLocations: [], shippingZones: [],
};
const product = { id: "product", handle: "cup", title: "Cup", description: "", variants: [{ id: "variant", title: "Default", priceCents: 100, isAvailable: true }], images: [] };
const cart = { id: "cart", items: [{ id: "item", productTitle: "Cup", title: "Default", quantity: 1, lineTotalCents: 100, isAvailable: true }], subtotalCents: 100 };
const account = { customer: { name: "Buyer", email: "buyer@example.test", phone: null }, orders: [], addresses: [], credit: { balanceCents: 100, reservedCents: 0, currency: "USD", precision: 2, entries: [{ id: "entry", amountCents: -10, kind: "debit", createdAt: "2026-10-10T00:00:00Z" }] }, hasNext: false };
const catalog = { total: 1, page: 1, pageSize: 24, items: [{ id: "product", handle: "cup", title: "Cup", description: "", coverImageKey: null, lowestPriceCents: 100 }] };
const order = { order: { referenceCode: "REF", lifecycleStatus: "confirmed", purchaseTotalCents: 100, creditAppliedCents: 0, terms: { currency: "USD", precision: 2, payment: null, pickup: null } }, receivedCents: 100, paymentStatus: null, refunds: [], returns: [], returnableItems: [], items: [], fulfillment: null, shipments: [], proposal: null };

describe("storefront response contracts", () => {
  it.each([
    [parseStoreDto, store], [parseProductDto, product], [parseCartDto, cart],
    [parseCustomerAccountDto, account], [parseCatalogDto, catalog], [parseOrderDetailDto, order],
    [parsePaymentCheckoutDto, { url: "https://checkout.stripe.com/c/pay" }],
    [parseUploadIntentDto, { intentId: "intent" }], [parseRecoveryOrderDto, { orderId: "order" }],
  ] as const)("accepts a valid response", (parse, value) => { expect(parse(value)).toEqual(value); });
  it.each([
    [parseStoreDto, { ...store, isPaused: "false" }],
    [parseStoreDto, { ...store, pickupLocations: [{ id: "location", name: "Pickup", address: "Street", scheduleRequired: true, dates: [{ date: "2026-10-10", slots: [{}] }] }] }],
    [parseProductDto, { ...product, variants: [{ ...product.variants[0], priceCents: -1 }] }],
    [parseCartDto, { ...cart, items: [{ ...cart.items[0], quantity: 1.5 }] }],
    [parseCustomerAccountDto, { ...account, addresses: [{ id: "address", label: "Home", address: { line1: 123 } }] }],
    [parseCustomerAccountDto, { ...account, credit: { ...account.credit, entries: [{ ...account.credit.entries[0], createdAt: "invalid" }] } }],
    [parseCatalogDto, { ...catalog, pageSize: 0 }],
    [parseOrderDetailDto, { ...order, order: { ...order.order, terms: { currency: "USD", precision: "2", payment: null } } }],
    [parsePaymentCheckoutDto, { url: "https://example.com/pay" }],
    [parseUploadIntentDto, { intentId: null }], [parseRecoveryOrderDto, {}],
  ] as const)("rejects malformed nested data", (parse, value) => { expect(() => parse(value)).toThrow("Invalid API response"); });
  it("rejects missing payloads instead of treating them as empty data", () => {
    expect(() => parseStoreDto(null)).toThrow();
    expect(() => parseCatalogDto({})).toThrow();
  });
});
