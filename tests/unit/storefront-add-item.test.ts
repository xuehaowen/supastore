import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ request: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("../../apps/storefront/lib/server-request", () => ({
  serverRequest: mocks.request,
  actionFailure: () => ({
    message: "Unable to save. Please retry.",
    requestId: "request-id",
  }),
}));
import { addItem, updateCartItem } from "../../apps/storefront/app/actions";

describe("add to bag action", () => {
  beforeEach(() => vi.clearAllMocks());
  it("returns confirmation and refreshes the layout after the backend mutation", async () => {
    mocks.request.mockResolvedValue({});
    const data = new FormData();
    data.set("locale", "en");
    data.set("variantId", "variant");
    data.set("quantity", "2");
    await expect(addItem({}, data)).resolves.toEqual({ saved: true });
    expect(mocks.request).toHaveBeenCalledWith("cart", {
      locale: "en",
      variantId: "variant",
      quantity: 2,
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/[locale]", "layout");
  });
  it("returns a visible failure without claiming the cart changed", async () => {
    mocks.request.mockRejectedValue(new Error("offline"));
    const result = await addItem({}, new FormData());
    expect(result.error).toBeTruthy();
    expect(result.saved).toBeUndefined();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});

describe("bag item changes", () => {
  beforeEach(() => vi.clearAllMocks());
  it("returns success and refreshes bag totals and header counts", async () => {
    mocks.request.mockResolvedValue({});
    const data = new FormData();
    data.set("locale", "en");
    data.set("itemId", "item");
    data.set("quantity", "0");
    await expect(updateCartItem(data)).resolves.toEqual({ saved: true });
    expect(mocks.request).toHaveBeenCalledWith(
      "cart",
      { locale: "en", itemId: "item", quantity: 0 },
      "PATCH",
    );
    expect(mocks.revalidate).toHaveBeenCalledWith("/[locale]", "layout");
  });
  it("reports a failed change without claiming the item was removed", async () => {
    mocks.request.mockRejectedValue(new Error("offline"));
    const result = await updateCartItem(new FormData());
    expect(result.error).toBeTruthy();
    expect(result.requestId).toBe("request-id");
    expect(result.saved).toBeUndefined();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
