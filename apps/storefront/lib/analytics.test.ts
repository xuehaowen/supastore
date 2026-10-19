import { afterEach, expect, it, vi } from "vitest";
import { analyticsPayload, sendAnalytics, trackPurchase } from "./analytics";
import { safeJsonLd } from "./seo";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function setup(consent: string | null) {
  const stored = new Map<string, string>();
  if (consent) stored.set("store-analytics-consent", consent);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  });
  vi.stubEnv(
    "NEXT_PUBLIC_ANALYTICS_ENDPOINT",
    "https://analytics.example.test/events",
  );
  return stored;
}
it("records shopping stages without private paths or query parameters", () => {
  expect(analyticsPayload("/en/cart")).toEqual({ event: "view_cart" });
  expect(analyticsPayload("/zh/checkout")).toEqual({ event: "begin_checkout" });
  expect(analyticsPayload("/en/checkout?quote=private")).toBeNull();
});
it.each([null, "no", "invalid"])(
  "sends no telemetry without explicit consent: %s",
  async (consent) => {
    setup(consent);
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(sendAnalytics({ event: "page_view" })).resolves.toBe(false);
    await trackPurchase("private", 10, "USD");
    expect(fetcher).not.toHaveBeenCalled();
  },
);
it("retries a failed purchase measurement and marks it only after acceptance", async () => {
  const stored = setup("yes");
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetcher);
  await trackPurchase("private-order", 12.34, "USD");
  expect(stored.has("store-purchase-analytics:private-order")).toBe(false);
  await trackPurchase("private-order", 12.34, "USD");
  await trackPurchase("private-order", 12.34, "USD");
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[0]![1]).toMatchObject({
    credentials: "omit",
    referrerPolicy: "no-referrer",
    body: JSON.stringify({ event: "purchase", amount: 12.34, currency: "USD" }),
  });
});
it("keeps one purchase request in flight across concurrent observers", async () => {
  setup("yes");
  let complete!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    complete = resolve;
  });
  const fetcher = vi.fn(() => pending);
  vi.stubGlobal("fetch", fetcher);
  const requests = [1, 2, 3].map(() =>
    trackPurchase("concurrent-private-order", 5, "USD"),
  );
  const count = fetcher.mock.calls.length;
  complete(new Response(null, { status: 204 }));
  await Promise.all(requests);
  expect(count).toBe(1);
});
it("never records private account/order/recovery paths or query tokens", () => {
  for (const path of [
    "/en/orders/order-id",
    "/en/account",
    "/en/recover?token=secret",
    "/en?token=secret",
  ]) {
    expect(analyticsPayload(path)).toBeNull();
  }
  expect(analyticsPayload("/en/products/shirt")).toEqual({
    event: "page_view",
    path: "/en/products/shirt",
  });
});
it("escapes JSON-LD markup to prevent executable script injection", () => {
  expect(
    safeJsonLd({ name: "</script><script>alert(1)</script>" }),
  ).not.toContain("<");
});
