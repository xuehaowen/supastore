import { describe, expect, it, vi } from "vitest";
import {
  consumeCheckoutDraft,
  CHECKOUT_PLACEMENT_PREFIX,
  CHECKOUT_DRAFT_TTL,
  checkoutDraftFields,
  checkoutDraftKey,
  readCheckoutDraft,
  saveCheckoutDraft,
} from "./checkout-draft";

describe("checkout draft", () => {
  it("consumes confirmation tokens once and preserves newer or unrelated drafts", () => {
    const entries = new Map<string, string>();
    const storage = {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        entries.set(key, value);
      },
      removeItem: (key: string) => {
        entries.delete(key);
      },
    } as Storage;
    const key = checkoutDraftKey("cart", "guest"),
      other = checkoutDraftKey("other", "member");
    storage.setItem(key, JSON.stringify({ savedAt: 100 }));
    storage.setItem(other, JSON.stringify({ savedAt: 100 }));
    storage.setItem(
      CHECKOUT_PLACEMENT_PREFIX + "token",
      JSON.stringify({ key, placedAt: 200 }),
    );
    consumeCheckoutDraft(storage, "token", 300);
    expect(storage.getItem(key)).toBeNull();
    expect(storage.getItem(other)).not.toBeNull();
    storage.setItem(key, JSON.stringify({ savedAt: 400 }));
    consumeCheckoutDraft(storage, "token", 500);
    expect(storage.getItem(key)).not.toBeNull();
    storage.setItem(
      CHECKOUT_PLACEMENT_PREFIX + "old",
      JSON.stringify({ key, placedAt: 200 }),
    );
    consumeCheckoutDraft(storage, "old", 500);
    expect(storage.getItem(key)).not.toBeNull();
  });
  it("stores only permitted details and never payment, consent or schedule fields", () => {
    const data = new FormData();
    for (const [name, value] of Object.entries({
      address: "12 Main St",
      city: "Oakland",
      paymentAccountId: "bank",
      creditAppliedCents: "100",
      accepted: "yes",
      pickupDate: "2026-10-25",
      pickupTime: "12:00",
      password: "secret",
    }))
      data.set(name, value);
    expect(checkoutDraftFields(data)).toEqual({
      address: "12 Main St",
      city: "Oakland",
    });
  });
  it("isolates customers and carts", () => {
    expect(checkoutDraftKey("cart-a", "guest")).not.toBe(
      checkoutDraftKey("cart-a", "member"),
    );
    expect(checkoutDraftKey("cart-a", "guest")).not.toBe(
      checkoutDraftKey("cart-b", "guest"),
    );
  });
  it("restores valid drafts, discards expired drafts and rejects invalid payloads", () => {
    const now = Date.now();
    const storage = {
      getItem: vi.fn(() =>
        JSON.stringify({
          version: 1,
          savedAt: now,
          fields: { address: "Café street", password: "secret" },
        }),
      ),
      removeItem: vi.fn(),
    };
    expect(readCheckoutDraft(storage, "key", now)).toEqual({
      address: "Café street",
    });
    expect(
      readCheckoutDraft(storage, "key", now + CHECKOUT_DRAFT_TTL),
    ).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith("key");
    storage.getItem.mockReturnValue("{broken");
    expect(readCheckoutDraft(storage, "key", now)).toBeNull();
    storage.getItem.mockReturnValue(
      JSON.stringify({
        version: 1,
        savedAt: now + 1000,
        fields: { address: "bad" },
      }),
    );
    expect(readCheckoutDraft(storage, "key", now)).toBeNull();
  });
  it("tolerates blocked storage without affecting checkout", () => {
    const data = new FormData();
    data.set("address", "Main St");
    expect(
      saveCheckoutDraft(
        {
          setItem: () => {
            throw new Error("denied");
          },
        },
        "key",
        data,
      ),
    ).toBe(false);
    expect(
      readCheckoutDraft(
        {
          getItem: () => {
            throw new Error("denied");
          },
          removeItem: vi.fn(),
        },
        "key",
      ),
    ).toBeNull();
  });
});
