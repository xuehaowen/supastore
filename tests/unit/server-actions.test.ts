import * as actions from "@/app/actions";
import { submitManualOrder } from "@/app/admin/manual-order-actions";
import { DomainError } from "@/application/common/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  commands: Object.fromEntries(
    [
      "addToCart",
      "updateCartItem",
      "getQuote",
      "createOrder",
      "createManualOrder",
      "requestTrackingLink",
      "verifyTrackingLink",
      "acceptOrderChange",
      "proposeOrderChange",
      "createProduct",
      "updateProduct",
      "addProductVariant",
      "removeProductVariant",
      "addProductImage",
      "removeProductImage",
      "updateCategory",
      "removeCategory",
      "saveCatalogTranslation",
      "savePromotion",
      "setPromotionActive",
      "updateProductAvailability",
      "updateStoreSettings",
      "configureShipping",
      "bootstrapOwner",
      "recordReceipt",
      "confirmOrder",
      "fulfillOrder",
      "dispatchOrder",
      "completePickupHandoff",
      "markReadyForPickup",
      "cancelOrder",
      "authorizeRefund",
      "claimPayout",
      "reconcilePayout",
      "resolvePayoutDiscrepancy",
      "closePayoutAttempt",
      "authorizeSurplusReturn",
      "recordCashReceipt",
      "correctReceipt",
      "correctFulfillment",
      "updateStaffMembership",
      "removeStaffMembership",
      "requestEmailVerification",
      "verifyEmailDelivery",
    ].map((name) => [name, vi.fn()]),
  ),
  staff: vi.fn(),
  guest: vi.fn(),
  token: vi.fn(),
  setToken: vi.fn(),
  allow: vi.fn(),
  verify: vi.fn(),
  write: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error("REDIRECT:" + path);
  },
}));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/infrastructure/auth", () => ({
  staffAuth: {
    api: {
      getSession: async () => ({ user: { email: "owner@example.test" } }),
    },
  },
}));
vi.mock("@/infrastructure/web", () => ({
  staffIdentity: mocks.staff,
  guestIdentity: mocks.guest,
  customerIdentity: async () => "",
  orderToken: mocks.token,
  setOrderToken: mocks.setToken,
  localeOf: (value: string) => (value === "zh" ? "zh" : "en"),
}));
vi.mock("@/application/common/rate-limit", () => ({
  allowRequest: mocks.allow,
}));
vi.mock("@/infrastructure/auth/session", () => ({
  verifyStaffInTransaction: mocks.verify,
}));
vi.mock("@/infrastructure/db", () => ({
  db: { transaction: mocks.transaction },
}));
vi.mock("@/application/use-cases/cart/add-to-cart", () => ({
  addToCart: mocks.commands.addToCart,
}));
vi.mock("@/application/use-cases/cart/update-cart-item", () => ({
  updateCartItem: mocks.commands.updateCartItem,
}));
vi.mock("@/application/use-cases/get-quote", () => ({
  getQuote: mocks.commands.getQuote,
}));
vi.mock("@/application/use-cases/create-order", () => ({
  createOrder: mocks.commands.createOrder,
}));
vi.mock("@/application/use-cases/create-manual-order", () => ({
  createManualOrder: mocks.commands.createManualOrder,
}));
vi.mock("@/application/use-cases/guest/request-tracking-link", () => ({
  requestTrackingLink: mocks.commands.requestTrackingLink,
}));
vi.mock("@/application/use-cases/guest/verify-tracking-link", () => ({
  verifyTrackingLink: mocks.commands.verifyTrackingLink,
}));
vi.mock("@/application/use-cases/order-proposals", () => ({
  acceptOrderChange: mocks.commands.acceptOrderChange,
  proposeOrderChange: mocks.commands.proposeOrderChange,
}));
vi.mock("@/application/use-cases/catalog/create-product", () => ({
  createProduct: mocks.commands.createProduct,
}));
vi.mock("@/application/use-cases/catalog/update-product", () => ({
  updateProduct: mocks.commands.updateProduct,
}));
vi.mock("@/application/use-cases/catalog/manage-catalog", () => ({
  addProductVariant: mocks.commands.addProductVariant,
  removeProductVariant: mocks.commands.removeProductVariant,
  addProductImage: mocks.commands.addProductImage,
  removeProductImage: mocks.commands.removeProductImage,
  updateCategory: mocks.commands.updateCategory,
  removeCategory: mocks.commands.removeCategory,
  saveCatalogTranslation: mocks.commands.saveCatalogTranslation,
}));
vi.mock("@/application/use-cases/catalog/update-product-availability", () => ({
  updateProductAvailability: mocks.commands.updateProductAvailability,
}));
vi.mock("@/application/use-cases/promotions/manage-promotions", () => ({
  savePromotion: mocks.commands.savePromotion,
  setPromotionActive: mocks.commands.setPromotionActive,
}));
vi.mock("@/application/use-cases/store/update-store-settings", () => ({
  updateStoreSettings: mocks.commands.updateStoreSettings,
}));
vi.mock("@/application/use-cases/store/configure-shipping", () => ({
  configureShipping: mocks.commands.configureShipping,
}));
vi.mock("@/application/use-cases/bootstrap-owner", () => ({
  bootstrapOwner: mocks.commands.bootstrapOwner,
}));
vi.mock("@/application/use-cases/record-receipt", () => ({
  recordReceipt: mocks.commands.recordReceipt,
}));
vi.mock("@/application/use-cases/confirm-order", () => ({
  confirmOrder: mocks.commands.confirmOrder,
}));
vi.mock("@/application/use-cases/fulfillment/dispatch-order", () => ({
  dispatchOrder: mocks.commands.dispatchOrder,
}));
vi.mock("@/application/use-cases/fulfill-order", () => ({
  fulfillOrder: mocks.commands.fulfillOrder,
}));
vi.mock("@/application/use-cases/fulfillment/fulfillment-operations", () => ({
  completePickupHandoff: mocks.commands.completePickupHandoff,
  markReadyForPickup: mocks.commands.markReadyForPickup,
}));
vi.mock("@/application/use-cases/orders/cancel-order", () => ({
  cancelOrder: mocks.commands.cancelOrder,
}));
vi.mock("@/application/use-cases/refund-payout", () => ({
  authorizeRefund: mocks.commands.authorizeRefund,
  claimPayout: mocks.commands.claimPayout,
  reconcilePayout: mocks.commands.reconcilePayout,
  resolvePayoutDiscrepancy: mocks.commands.resolvePayoutDiscrepancy,
  closePayoutAttempt: mocks.commands.closePayoutAttempt,
}));
vi.mock("@/application/use-cases/orders/surplus-return", () => ({
  authorizeSurplusReturn: mocks.commands.authorizeSurplusReturn,
}));
vi.mock("@/application/use-cases/payments/record-cash-receipt", () => ({
  recordCashReceipt: mocks.commands.recordCashReceipt,
}));
vi.mock("@/application/use-cases/payments/correct-receipt", () => ({
  correctReceipt: mocks.commands.correctReceipt,
}));
vi.mock("@/application/use-cases/fulfillment/fulfillment-operations", () => ({
  correctFulfillment: mocks.commands.correctFulfillment,
  completePickupHandoff: mocks.commands.completePickupHandoff,
  markReadyForPickup: mocks.commands.markReadyForPickup,
}));
vi.mock("@/application/use-cases/staff/manage-staff", () => ({
  updateStaffMembership: mocks.commands.updateStaffMembership,
  removeStaffMembership: mocks.commands.removeStaffMembership,
}));
vi.mock("@/application/use-cases/store/verify-email", () => ({
  requestEmailVerification: mocks.commands.requestEmailVerification,
  verifyEmailDelivery: mocks.commands.verifyEmailDelivery,
}));
const id = "00000000-0000-0000-0000-000000000001";
const base: Record<string, string> = {
  locale: "en",
  variantId: id,
  itemId: id,
  cartId: id,
  orderId: id,
  quoteId: id,
  proposalId: id,
  receiptId: id,
  accountId: id,
  allocationId: id,
  attemptId: id,
  discrepancyId: id,
  quantity: "1",
  itemCount: "1",
  "quantity-0": "1",
  customerName: "Manual Customer",
  customerEmail: "manual@example.test",
  fulfillmentType: "shipping",
  country: "US",
  address: "1 Test St",
  paymentAccountId: id,
  accepted: "yes",
  name: "Customer",
  email: "customer@example.test",
  reference: "BANK-123",
  token: "recovery-token",
  secret: "setup-secret",
  storeName: "Test store",
  supportEmail: "support@example.test",
  currency: "USD",
  precision: "2",
  defaultLocale: "en",
  timezone: "UTC",
  taxRate: "0",
  zoneName: "Standard",
  countries: "US",
  rate: "500",
  prepMinutes: "60",
  days: "mon",
  startTime: "09:00",
  endTime: "17:00",
  instructions: "Bank instructions",
  paused: "true",
  handle: "test-product",
  title: "Test product",
  variantCount: "1",
  "sku-0": "SKU-1",
  sku: "SKU-NEW",
  "variantTitle-0": "Default",
  "price-0": "1000",
  productId: id,
  quoteVersion: "1",
  "variantId-0": id,
  imageCount: "0",
  imageId: id,
  s3Key: "products/image.jpg",
  altText: "Product image",
  price: "1000",
  categoryId: id,
  entityId: id,
  entityType: "product",
  translationLocale: "zh",
  promotionId: id,
  code: "SAVE10",
  discountType: "percentage",
  discountValue: "1000",
  minimumSubtotal: "0",
  published: "true",
  available: "true",
  total: "1000",
  reason: "Customer request",
  verified: "on",
  amount: "1000",
  carrier: "Manual delivery",
  trackingNumber: "TRACK-1",
  handoffActor: "Customer",
  verificationMethod: "scoped_order_page",
  tenderedAmount: "1000",
  delta: "-100",
  destinationType: "cash",
  destination: "Customer",
  actualAmount: "1000",
  transferReference: "TRANSFER-1",
  writeOff: "0",
  targetUserId: "staff-target",
  role: "staff",
  active: "true",
  slug: "category",
};
function form(overrides: Record<string, string | null> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ ...base, ...overrides }))
    if (value !== null) data.set(key, value);
  return data;
}
const cases = [
  ["addItem", "addToCart", "/en/cart"],
  ["changeItem", "updateCartItem", "/en/cart"],
  ["quoteCart", "getQuote", "/en/checkout?quote=" + id],
  ["placeOrder", "createOrder", "/en/orders/" + id],
  [
    "createManualOrderAction",
    "createManualOrder",
    "/admin/orders?created=SP-MANUAL",
  ],
  ["recoverOrder", "requestTrackingLink", "/recover?sent=1"],
  ["exchangeLink", "verifyTrackingLink", "/en/orders/" + id],
  ["acceptProposal", "acceptOrderChange", "/en/orders/" + id],
  ["setupOwner", "bootstrapOwner", "/admin/setup"],
  ["saveSettings", "updateStoreSettings", "/admin/setup"],
  ["saveShipping", "configureShipping", "/admin/setup"],
  ["savePickup", "configureShipping", "/admin/setup"],
  ["togglePause", "updateStoreSettings", "/admin"],
  ["saveProduct", "createProduct", "/admin/products"],
  [
    "editProduct",
    "updateProduct",
    "/admin/products/" + id + "/edit?saved=true",
  ],
  ["toggleAvailability", "updateProductAvailability", "/admin/products"],
  [
    "createProductVariant",
    "addProductVariant",
    `/admin/products/${id}/edit?added=variant`,
  ],
  [
    "deleteProductVariant",
    "removeProductVariant",
    `/admin/products/${id}/edit?removed=archived`,
  ],
  [
    "createProductImage",
    "addProductImage",
    `/admin/products/${id}/edit?added=image`,
  ],
  [
    "deleteProductImage",
    "removeProductImage",
    `/admin/products/${id}/edit?removed=image`,
  ],
  ["editCategory", "updateCategory", "/admin/categories"],
  ["deleteCategory", "removeCategory", "/admin/categories"],
  ["saveCatalogTranslation", "saveCatalogTranslation", "/admin/translations"],
  ["upsertPromotion", "savePromotion", "/admin/promotions"],
  ["togglePromotion", "setPromotionActive", "/admin/promotions"],
  ["proposeChange", "proposeOrderChange", "/admin"],
  ["receivePayment", "recordReceipt", "/admin"],
  ["confirmPayment", "confirmOrder", "/admin"],
  ["fulfillConfirmedOrder", "fulfillOrder", "/admin"],
  ["dispatchConfirmedOrder", "dispatchOrder", "/admin"],
  ["markOrderReady", "markReadyForPickup", "/admin"],
  ["completeOrderPickup", "completePickupHandoff", "/admin"],
  ["cancelAdminOrder", "cancelOrder", "/admin"],
  ["authorizeOrderRefund", "authorizeRefund", "/admin"],
  ["authorizeOrderSurplusReturn", "authorizeSurplusReturn", "/admin"],
  ["receiveCashPayment", "recordCashReceipt", "/admin"],
  ["correctRecordedReceipt", "correctReceipt", "/admin"],
  ["correctOrderFulfillment", "correctFulfillment", "/admin"],
  ["claimOrderPayout", "claimPayout", "/admin"],
  ["reconcileOrderPayout", "reconcilePayout", "/admin"],
  ["resolveOrderPayoutDiscrepancy", "resolvePayoutDiscrepancy", "/admin"],
  ["closeOrderPayoutAttempt", "closePayoutAttempt", "/admin"],
  ["updateStaffMember", "updateStaffMembership", "/admin/setup"],
  ["removeStaffMember", "removeStaffMembership", "/admin/setup"],
  ["sendVerification", "requestEmailVerification", "/admin/setup?sent=1"],
  ["verifyEmail", "verifyEmailDelivery", "/admin/setup"],
] as const;
const expectedPayloads: Record<string, unknown> = {
  createProductVariant: {
    staffUserId: "staff-session",
    productId: id,
    sku: "SKU-NEW",
    priceCents: 1000,
  },
  deleteProductVariant: {
    staffUserId: "staff-session",
    productId: id,
    variantId: id,
  },
  createProductImage: {
    staffUserId: "staff-session",
    productId: id,
    s3Key: "products/image.jpg",
  },
  deleteProductImage: {
    staffUserId: "staff-session",
    productId: id,
    imageId: id,
  },
  editCategory: { staffUserId: "staff-session", categoryId: id },
  deleteCategory: { staffUserId: "staff-session", categoryId: id },
  saveCatalogTranslation: {
    staffUserId: "staff-session",
    entityType: "product",
    entityId: id,
    locale: "zh",
  },
  upsertPromotion: {
    staffUserId: "staff-session",
    code: "SAVE10",
    discountType: "percentage",
    discountValue: 1000,
  },
  togglePromotion: { staffUserId: "staff-session", id, isActive: true },
  editProduct: {
    staffUserId: "staff-session",
    productId: id,
    quoteVersion: 1,
    images: [],
    variants: [{ id, priceCents: 1000 }],
  },
  addItem: {
    guestSessionId: "guest-session",
    variantId: id,
    quantity: 1,
    locale: "en",
  },
  changeItem: {
    guestSessionId: "guest-session",
    itemId: id,
    quantity: 1,
    locale: "en",
  },
  quoteCart: {
    guestSessionId: "guest-session",
    cartId: id,
    fulfillmentType: "shipping",
    shippingAddress: {
      country: "US",
      address: "1 Test St",
      region: "",
      postalCode: "",
    },
    paymentAccountId: id,
  },
  placeOrder: {
    guestSessionId: "guest-session",
    quoteId: id,
    guestName: "Customer",
    guestEmail: "customer@example.test",
  },
  createManualOrderAction: {
    staffUserId: "staff-session",
    customerName: "Manual Customer",
    customerEmail: "manual@example.test",
    country: "US",
    address: "1 Test St",
    paymentAccountId: id,
    items: [{ variantId: id, quantity: 1 }],
  },
  recoverOrder: { email: "customer@example.test", referenceCode: "BANK-123" },
  exchangeLink: { recoveryToken: "recovery-token" },
  acceptProposal: {
    orderId: id,
    proposalId: id,
    sessionToken: "order-session",
  },
  setupOwner: {
    ownerUserId: "staff-session",
    ownerEmail: "owner@example.test",
    storeName: "Test store",
    adminSetupSecret: "setup-secret",
  },
  saveSettings: {
    staffUserId: "staff-session",
    storeName: "Test store",
    precision: 2,
    taxRateBasisPoints: 0,
    defaultLocale: "en",
    timezone: "UTC",
  },
  saveShipping: {
    staffUserId: "staff-session",
    zones: [
      {
        name: "Standard",
        countryCodes: ["US"],
        rateCents: 500,
        freeThresholdCents: null,
      },
    ],
  },
  savePickup: {
    staffUserId: "staff-session",
    pickup: {
      name: "Customer",
      address: "1 Test St",
      weeklySchedule: { mon: [["09:00", "17:00"]] },
      prepMinutes: 60,
    },
  },
  togglePause: { staffUserId: "staff-session", isPaused: true },
  saveProduct: {
    staffUserId: "staff-session",
    handle: "test-product",
    title: "Test product",
    variants: [
      {
        sku: "SKU-1",
        title: "Default",
        priceCents: 1000,
        attributes: { color: "", size: "" },
      },
    ],
  },
  toggleAvailability: {
    staffUserId: "staff-session",
    productId: id,
    isPublished: true,
  },
  proposeChange: {
    staffUserId: "staff-session",
    orderId: id,
    totalCents: 1000,
    reason: "Customer request",
  },
  receivePayment: {
    staffUserId: "staff-session",
    orderId: id,
    paymentAccountId: id,
    amountCents: 1000,
    rawReference: "BANK-123",
  },
  confirmPayment: { staffUserId: "staff-session", orderId: id },
  dispatchConfirmedOrder: {
    orderId: "00000000-0000-0000-0000-000000000001",
    carrier: "Manual delivery",
  },
  fulfillConfirmedOrder: {
    staffUserId: "staff-session",
    orderId: id,
    carrier: "Manual delivery",
    trackingNumber: "TRACK-1",
  },
  markOrderReady: { staffUserId: "staff-session", orderId: id },
  completeOrderPickup: {
    staffUserId: "staff-session",
    orderId: id,
    handoffActor: "Customer",
    verificationMethod: "scoped_order_page",
  },
  cancelAdminOrder: {
    actorUserId: "staff-session",
    orderId: id,
    reason: "Customer request",
    isCustomerRequest: false,
  },
  authorizeOrderRefund: {
    ownerUserId: "staff-session",
    orderId: id,
    receiptId: id,
    amountCents: 1000,
    reason: "Customer request",
  },
  authorizeOrderSurplusReturn: {
    ownerUserId: "staff-session",
    orderId: id,
    receiptId: id,
    amountCents: 1000,
    reason: "Customer request",
  },
  receiveCashPayment: {
    staffUserId: "staff-session",
    orderId: id,
    paymentAccountId: id,
    amountCents: 1000,
    tenderedAmountCents: 1000,
  },
  correctRecordedReceipt: {
    ownerUserId: "staff-session",
    receiptId: id,
    deltaAmountCents: -100,
    reason: "Customer request",
  },
  correctOrderFulfillment: {
    staffUserId: "staff-session",
    orderId: id,
    carrier: "Manual delivery",
    trackingNumber: "TRACK-1",
    reason: "Customer request",
  },
  claimOrderPayout: {
    ownerUserId: "staff-session",
    allocationId: id,
    claimedAmountCents: 1000,
    destination: { type: "cash", rawDestination: "Customer" },
  },
  reconcileOrderPayout: {
    ownerUserId: "staff-session",
    attemptId: id,
    actualAmountCents: 1000,
    transferReference: "TRANSFER-1",
    actualDestination: { type: "cash", rawDestination: "Customer" },
  },
  resolveOrderPayoutDiscrepancy: {
    ownerUserId: "staff-session",
    discrepancyId: id,
    writeOffCents: 0,
    resolutionReason: "Customer request",
  },
  closeOrderPayoutAttempt: {
    ownerUserId: "staff-session",
    attemptId: id,
    reason: "Customer request",
  },
  updateStaffMember: {
    actorUserId: "staff-session",
    targetUserId: "staff-target",
    role: "staff",
    isActive: true,
  },
  removeStaffMember: {
    actorUserId: "staff-session",
    targetUserId: "staff-target",
  },
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.staff.mockResolvedValue("staff-session");
  mocks.guest.mockResolvedValue("guest-session");
  mocks.token.mockResolvedValue("order-session");
  mocks.allow.mockReturnValue(true);
  for (const command of Object.values(mocks.commands))
    command.mockResolvedValue(undefined);
  mocks.commands.getQuote.mockResolvedValue({ id });
  mocks.commands.updateProduct.mockResolvedValue(id);
  mocks.commands.removeProductVariant.mockResolvedValue("archived");
  mocks.commands.createOrder.mockResolvedValue({
    id,
    sessionToken: "new-token",
  });
  mocks.commands.createManualOrder.mockResolvedValue({
    referenceCode: "SP-MANUAL",
  });
  mocks.commands.verifyTrackingLink.mockResolvedValue({
    orderId: id,
    sessionToken: "new-token",
  });
  const tx = {
    select: () => ({
      from: () => ({ for: async () => [], where: async () => [] }),
    }),
    insert: () => ({
      values: (value: Record<string, unknown>) => {
        mocks.write(value);
        return { returning: async () => [{ id, ...value }] };
      },
    }),
    update: () => ({
      set: (value: Record<string, unknown>) => ({
        where: () => {
          mocks.write(value);
          return { returning: async () => [{ id, ...value }] };
        },
      }),
    }),
  };
  mocks.transaction.mockImplementation(async (work) => work(tx));
});
describe("every server action request boundary", () => {
  it.each([
    ["updateStaffMember", "updateStaffMembership"],
    ["removeStaffMember", "removeStaffMembership"],
  ] as const)(
    "%s keeps the rejected staff editor in context",
    async (action, command) => {
      mocks.commands[command].mockRejectedValueOnce(
        new DomainError("The last active owner cannot be removed"),
      );
      await expect(actions[action](form())).rejects.toThrow(
        "REDIRECT:/admin/setup?staff=staff-target&error=The%20last%20active%20owner",
      );
    },
  );
  it("returns inline manual-order errors for correction without a redirect", async () => {
    mocks.commands.createManualOrder.mockRejectedValueOnce(
      new DomainError("This fulfillment slot is full. Choose another time."),
    );
    await expect(submitManualOrder(form())).resolves.toEqual({
      error: "This fulfillment slot is full. Choose another time.",
    });
  });

  it("returns the created manual-order reference after inline success", async () => {
    await expect(submitManualOrder(form())).resolves.toEqual({
      referenceCode: "SP-MANUAL",
    });
  });

  it("hides unexpected inline manual-order failures", async () => {
    mocks.commands.createManualOrder.mockRejectedValueOnce(
      new Error("private detail"),
    );
    await expect(submitManualOrder(form())).resolves.toEqual({
      error: "Unable to save. Please retry.",
      requestId: expect.any(String),
    });
  });
  it("forwards manual pickup location and schedule without a shipping address", async () => {
    const request = form();
    request.set("fulfillmentType", "pickup");
    request.set("pickupLocationId", id);
    request.set("pickupDate", "2026-11-01");
    request.set("pickupTime", "12:00");
    request.delete("country");
    request.delete("address");
    await expect(actions.createManualOrderAction(request)).rejects.toThrow(
      "REDIRECT:/admin/orders?created=SP-MANUAL",
    );
    expect(mocks.commands.createManualOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        fulfillmentType: "pickup",
        pickupLocationId: id,
        pickupDate: "2026-11-01",
        pickupTime: "12:00",
        country: "",
        address: "",
      }),
    );
  });

  it("requires a contract case for every exported action", () => {
    expect(Object.keys(actions).sort()).toEqual(
      [
        ...cases.map((c) => c[0]),
        "savePayment",
        "saveCategory",
        "quoteCheckout",
        "placeCheckout",
      ].sort(),
    );
  });
  it.each(cases)("%s dispatches and redirects", async (name, command, path) => {
    await expect(actions[name](form())).rejects.toThrow("REDIRECT:" + path);
    expect(mocks.commands[command]).toHaveBeenCalledTimes(1);
    if (!["sendVerification", "verifyEmail"].includes(name))
      expect(mocks.commands[command].mock.calls[0][0]).toMatchObject(
        expectedPayloads[name] as Record<string, unknown>,
      );
  });
  it.each(cases)("%s shows domain rejection", async (name, command) => {
    mocks.commands[command].mockRejectedValueOnce(
      new DomainError("Request rejected"),
    );
    await expect(actions[name](form())).rejects.toThrow(
      "error=Request%20rejected",
    );
  });
  it.each(cases)("%s hides unexpected failures", async (name, command) => {
    mocks.commands[command].mockRejectedValueOnce(
      new Error("private database credentials"),
    );
    await expect(actions[name](form())).rejects.toThrow(
      "error=Unable%20to%20save",
    );
  });
  it.each(cases.filter((c) => c[2].startsWith("/admin")))(
    "%s cannot dispatch without staff identity",
    async (name, command) => {
      mocks.staff.mockRejectedValueOnce(new DomainError("Sign in required"));
      await expect(actions[name](form())).rejects.toThrow(
        "error=Sign%20in%20required",
      );
      expect(mocks.commands[command]).not.toHaveBeenCalled();
    },
  );
  it.each(["savePayment", "saveCategory"] as const)(
    "%s checks owner before writing",
    async (name) => {
      await expect(actions[name](form())).rejects.toThrow("REDIRECT:/admin");
      expect(mocks.verify).toHaveBeenCalledWith(
        expect.any(Object),
        "staff-session",
        "owner",
      );
      expect(mocks.write).toHaveBeenCalledTimes(2);
      expect(mocks.write).toHaveBeenLastCalledWith(
        expect.objectContaining({
          actorId: "staff-session",
          action: "created",
        }),
      );
    },
  );
  it.each(["savePayment", "saveCategory"] as const)(
    "%s rejects a forbidden owner operation",
    async (name) => {
      mocks.verify.mockRejectedValueOnce(new DomainError("Owner required"));
      await expect(actions[name](form())).rejects.toThrow(
        "error=Owner%20required",
      );
      expect(mocks.write).not.toHaveBeenCalled();
    },
  );
  it("preserves checkout consent and rate limits", async () => {
    await expect(actions.placeOrder(form({ accepted: null }))).rejects.toThrow(
      "error=Accept",
    );
    expect(mocks.commands.createOrder).not.toHaveBeenCalled();
    mocks.allow.mockReturnValue(false);
    await expect(actions.placeOrder(form())).rejects.toThrow(
      "error=Please%20wait",
    );
    expect(mocks.commands.createOrder).not.toHaveBeenCalled();
  });
  it("requires receipt verification", async () => {
    await expect(
      actions.receivePayment(form({ verified: null })),
    ).rejects.toThrow("error=Verify");
    expect(mocks.commands.recordReceipt).not.toHaveBeenCalled();
  });
  it("sets scoped access only after successful order creation", async () => {
    await expect(actions.placeOrder(form())).rejects.toThrow("REDIRECT");
    expect(mocks.setToken).toHaveBeenCalledWith(id, "new-token");
  });
});
const invalidCases: [
  Exclude<keyof typeof actions, "quoteCheckout" | "placeCheckout">,
  string,
  string,
][] = [
  ["addItem", "quantity", "0"],
  ["addItem", "variantId", "bad"],
  ["changeItem", "quantity", "-1"],
  ["changeItem", "itemId", "bad"],
  ["quoteCart", "fulfillmentType", "courier"],
  ["quoteCart", "cartId", "bad"],
  ["quoteCart", "pickupLocationId", "bad"],
  ["quoteCart", "address", "x".repeat(2001)],
  ["quoteCart", "region", "x".repeat(13)],
  ["quoteCart", "promotionCode", "x".repeat(101)],
  ["placeOrder", "quoteId", "bad"],
  ["acceptProposal", "orderId", "bad"],
  ["acceptProposal", "proposalId", "bad"],
  ["saveSettings", "precision", ""],
  ["saveSettings", "taxRate", ""],
  ["saveSettings", "defaultLocale", "xx"],
  ["saveShipping", "rate", ""],
  ["saveShipping", "freeThreshold", "x"],
  ["savePickup", "prepMinutes", ""],
  ["savePickup", "pickupLocationId", "bad"],
  ["saveProduct", "price-0", ""],
  ["saveProduct", "variantCount", "0"],
  ["saveProduct", "variantCount", "51"],
  ["saveProduct", "variantCount", "1.5"],
  ["togglePause", "paused", "invalid"],
  ["toggleAvailability", "published", "invalid"],
  ["toggleAvailability", "productId", "bad"],
  ["updateStaffMember", "active", "invalid"],
  ["updateStaffMember", "role", "admin"],
  ["updateStaffMember", "targetUserId", ""],
  ["removeStaffMember", "targetUserId", ""],
  ["proposeChange", "total", ""],
  ["receivePayment", "amount", ""],
  ["confirmPayment", "orderId", "bad"],
  ["markOrderReady", "orderId", "bad"],
  ["fulfillConfirmedOrder", "orderId", "bad"],
  ["completeOrderPickup", "verificationMethod", "guesswork"],
  ["authorizeOrderRefund", "amount", "0"],
  ["authorizeOrderSurplusReturn", "amount", "0"],
  ["receiveCashPayment", "tenderedAmount", ""],
  ["correctRecordedReceipt", "delta", "1.5"],
  ["claimOrderPayout", "destinationType", "crypto"],
  ["reconcileOrderPayout", "actualAmount", ""],
  ["resolveOrderPayoutDiscrepancy", "writeOff", "-1"],
  ["closeOrderPayoutAttempt", "attemptId", "bad"],
  ["savePayment", "name", ""],
  ["savePayment", "id", "bad"],
  ["saveCategory", "parentId", "bad"],
  ["saveCategory", "slug", "Invalid Slug"],
];
describe("malformed frontend requests", () => {
  it.each(invalidCases)(
    "%s rejects malformed %s",
    async (name, field, value) => {
      await expect(actions[name](form({ [field]: value }))).rejects.toThrow(
        "error=",
      );
      for (const command of Object.values(mocks.commands))
        expect(command).not.toHaveBeenCalled();
      expect(mocks.write).not.toHaveBeenCalled();
    },
  );
});

describe("checkout form actions", () => {
  it("rejects malformed quotes without redirecting or dispatching", async () => {
    const result = await actions.quoteCheckout({}, form({ cartId: "bad" }));
    expect(result.error).toBeTruthy();
    expect(mocks.commands.getQuote).not.toHaveBeenCalled();
  });
  it("requires a usable payment before guest order review", async () => {
    mocks.commands.getQuote!.mockResolvedValue({
      id,
      totalPayableCents: 1000,
      termsSnapshot: { payment: null, onlinePayment: false },
    });
    await expect(
      actions.quoteCheckout({}, form({ paymentAccountId: null })),
    ).resolves.toEqual({ error: "Choose an active payment method." });
    expect(mocks.commands.createOrder).not.toHaveBeenCalled();
  });
  it.each([
    {
      totalPayableCents: 0,
      termsSnapshot: { payment: null, onlinePayment: false },
    },
    {
      totalPayableCents: 1000,
      termsSnapshot: { payment: { id }, onlinePayment: false },
    },
    {
      totalPayableCents: 1000,
      termsSnapshot: { payment: null, onlinePayment: true },
    },
  ])("reviews a payable or free quote", async (quote) => {
    mocks.commands.getQuote!.mockResolvedValue({ id, ...quote });
    await expect(actions.quoteCheckout({}, form())).rejects.toThrow(
      "REDIRECT:/en/checkout?quote=" + id,
    );
  });
  it("returns localized quote failures without exposing unexpected errors", async () => {
    mocks.commands.getQuote!.mockRejectedValue(
      new DomainError("This promotion code is not active."),
    );
    await expect(
      actions.quoteCheckout({}, form({ locale: "zh" })),
    ).resolves.toEqual({ error: "此优惠码不可用。" });
    mocks.commands.getQuote!.mockRejectedValue(
      new Error("database credentials"),
    );
    const result = await actions.quoteCheckout({}, form());
    expect(result.error).toBe(
      "Unable to save. Check your entries and try again.",
    );
  });
  it("returns consent errors on the current step", async () => {
    await expect(
      actions.placeCheckout({}, form({ accepted: null })),
    ).resolves.toEqual({
      error: "Accept the final total before placing an order.",
    });
    await expect(
      actions.placeCheckout({}, form({ accepted: null, locale: "zh" })),
    ).resolves.toEqual({ error: "请接受最终总价后再下单。" });
    expect(mocks.commands.createOrder).not.toHaveBeenCalled();
  });
  it("rejects malformed order IDs before creating an order", async () => {
    expect(
      (await actions.placeCheckout({}, form({ quoteId: "bad" }))).error,
    ).toBeTruthy();
    expect(mocks.commands.createOrder).not.toHaveBeenCalled();
  });
  it("redirects successful orders only after setting their private token", async () => {
    await expect(actions.placeCheckout({}, form())).rejects.toThrow(
      "REDIRECT:/en/orders/" + id,
    );
    expect(mocks.setToken).toHaveBeenCalledWith(id, "new-token");
  });
});

describe("optional and alternate action forms", () => {
  it("toggles a variant without product fields", async () => {
    await expect(
      actions.toggleAvailability(form({ productId: null, available: "false" })),
    ).rejects.toThrow("REDIRECT:/admin/products");
    expect(mocks.commands.updateProductAvailability).toHaveBeenCalledWith({
      staffUserId: "staff-session",
      variantId: id,
      isAvailable: false,
    });
  });
  it("updates an existing payment account", async () => {
    await expect(
      actions.savePayment(form({ id, active: "false" })),
    ).rejects.toThrow("REDIRECT:/admin/setup");
    expect(mocks.write).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false }),
    );
  });
  it("dispatches email verification with the authenticated identity", async () => {
    await expect(actions.verifyEmail(form())).rejects.toThrow("REDIRECT");
    expect(mocks.commands.verifyEmailDelivery).toHaveBeenCalledWith(
      "staff-session",
      "recovery-token",
    );
  });
  it("updates an existing pickup location after validating its id", async () => {
    await expect(
      actions.savePickup(form({ pickupLocationId: id })),
    ).rejects.toThrow("REDIRECT:/admin/setup");
    expect(mocks.commands.configureShipping).toHaveBeenCalledWith(
      expect.objectContaining({
        pickup: expect.objectContaining({ id }),
      }),
    );
  });
  it("preserves multiple pickup windows submitted by the schedule editor", async () => {
    const weeklySchedule = {
      mon: [
        ["09:00", "12:00"],
        ["13:00", "17:00"],
      ],
      tue: [],
    };
    await expect(
      actions.savePickup(
        form({
          pickupLocationId: id,
          weeklySchedule: JSON.stringify(weeklySchedule),
        }),
      ),
    ).rejects.toThrow("REDIRECT:/admin/setup");
    expect(mocks.commands.configureShipping).toHaveBeenCalledWith(
      expect.objectContaining({
        pickup: expect.objectContaining({ id, weeklySchedule }),
      }),
    );
  });
  it("rejects overlapping pickup windows before saving", async () => {
    await expect(
      actions.savePickup(
        form({
          weeklySchedule: JSON.stringify({
            mon: [
              ["09:00", "14:00"],
              ["12:00", "17:00"],
            ],
          }),
        }),
      ),
    ).rejects.toThrow("REDIRECT:/admin/setup?error=");
    expect(mocks.commands.configureShipping).not.toHaveBeenCalled();
  });
  it("quotes pickup with explicit location and no payment method", async () => {
    await expect(
      actions.quoteCart(
        form({
          fulfillmentType: "pickup",
          pickupLocationId: id,
          pickupDate: "2030-01-01",
          pickupTime: "09:00",
          paymentAccountId: null,
        }),
      ),
    ).rejects.toThrow("REDIRECT");
    expect(mocks.commands.getQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        pickupLocationId: id,
        pickupDate: "2030-01-01",
        pickupTime: "09:00",
      }),
    );
    expect(mocks.commands.getQuote.mock.calls[0][0]).not.toHaveProperty(
      "paymentAccountId",
    );
  });
});
