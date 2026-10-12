import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  update: vi.fn(),
  cart: vi.fn(),
  create: vi.fn(),
  token: vi.fn(),
  quote: vi.fn(),
}));
vi.mock("@/infrastructure/web", () => ({
  guestIdentity: async () => "server-cart-proof",
  customerIdentity: async () => "verified-user",
  setOrderToken: mocks.token,
  localeOf: (v: unknown) => (v === "zh" ? "zh" : "en"),
}));
vi.mock("@/application/use-cases/cart/add-to-cart", () => ({
  addToCart: mocks.add,
}));
vi.mock("@/application/use-cases/cart/update-cart-item", () => ({
  updateCartItem: mocks.update,
}));
vi.mock("@/application/use-cases/cart/get-cart", () => ({
  getCart: mocks.cart,
}));
vi.mock("@/application/use-cases/create-order", () => ({
  createOrder: mocks.create,
}));
vi.mock("@/application/use-cases/get-quote", () => ({ getQuote: mocks.quote }));
import { POST as addItem, GET as readCart } from "@/app/api/v1/cart/route";
import { POST as order } from "@/app/api/v1/orders/route";
import { POST as quote } from "@/app/api/v1/quotes/route";
import { ConflictError } from "@/application/common/errors";
const id = "12345678-1234-4234-8234-123456789012";
const request = (body: unknown, origin = "https://shop.example") =>
  new Request("https://shop.example/api/v1/orders", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.cart.mockResolvedValue(null);
});
describe("commerce API route ownership", () => {
  it.each([
    { address: "x".repeat(2001) },
    { region: "x".repeat(13) },
    { paymentAccountId: false },
    { fulfillmentType: ["shipping"] },
  ])("rejects invalid quote fields before dispatch", async (change) => {
    const response = await quote(
      request({
        cartId: id,
        fulfillmentType: "shipping",
        country: "US",
        address: "1 Main",
        ...change,
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.quote).not.toHaveBeenCalled();
  });
  it("ignores submitted guest/customer identities and hides proof tokens", async () => {
    mocks.create.mockResolvedValue({
      id,
      referenceCode: "SP-EXAMPLE",
      lifecycleStatus: "unpaid",
      purchaseTotalCents: 100,
      sessionToken: "private-proof",
    });
    const response = await order(
      request({
        quoteId: id,
        name: "Buyer",
        email: "buyer@example.com",
        accepted: true,
        guestSessionId: "attacker",
        customerUserId: "victim",
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.create.mock.calls[0]![0]).toMatchObject({
      guestSessionId: "server-cart-proof",
      customerUserId: "verified-user",
    });
    expect(mocks.token).toHaveBeenCalledWith(id, "private-proof");
    expect(JSON.stringify(await response.json())).not.toContain(
      "private-proof",
    );
  });
  it("rejects cross-origin writes before calling cart use cases", async () => {
    expect(
      (
        await addItem(
          request({ variantId: id, quantity: 1 }, "https://attacker.example"),
        )
      ).status,
    ).toBe(403);
    expect(mocks.add).not.toHaveBeenCalled();
  });
  it("strips the guest proof hash from cart reads", async () => {
    mocks.cart.mockResolvedValue({
      id,
      guestSessionId: "secret-hash",
      revision: 1,
      items: [],
      subtotalCents: 0,
      itemCount: 0,
    });
    const response = await readCart(
      new Request("https://shop.example/api/v1/cart"),
    );
    expect(JSON.stringify(await response.json())).not.toContain("secret-hash");
  });
  it("preserves stale quote conflicts instead of returning a successful order", async () => {
    mocks.quote.mockRejectedValue(new ConflictError("Cart changed."));
    const response = await quote(
      request({
        cartId: id,
        fulfillmentType: "shipping",
        country: "US",
        address: "123 Main",
      }),
    );
    expect(response.status).toBe(409);
    expect(mocks.quote.mock.calls[0]![0].guestSessionId).toBe(
      "server-cart-proof",
    );
  });
});
