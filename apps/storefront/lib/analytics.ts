export function analyticsPayload(path: string): Record<string, string> | null {
  if (/^\/(en|zh)\/cart$/.test(path)) return { event: "view_cart" };
  if (/^\/(en|zh)\/checkout$/.test(path)) return { event: "begin_checkout" };
  return /^\/(en|zh)(?:\/products\/[^/]+)?$/.test(path)
    ? { event: "page_view", path }
    : null;
}
export function analyticsEndpoint() {
  const value = process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT;
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export const ANALYTICS_CONSENT_KEY = "store-analytics-consent";
export const ANALYTICS_CONSENT_EVENT = "store-analytics-consent-change";

export function analyticsConsent(): "yes" | "no" | "pending" {
  try {
    const choice = localStorage.getItem(ANALYTICS_CONSENT_KEY);
    return choice === "yes" || choice === "no" ? choice : "pending";
  } catch {
    return "no";
  }
}

export async function sendAnalytics(payload: Record<string, string | number>) {
  const endpoint = analyticsEndpoint();
  if (!endpoint || analyticsConsent() !== "yes") return false;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      referrerPolicy: "no-referrer",
      body: JSON.stringify(payload),
      keepalive: true,
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

const pendingPurchases = new Set<string>();
/** Best-effort per-browser measurement; private order identity never leaves storage. */
export async function trackPurchase(
  orderId: string,
  amount: number,
  currency: string,
) {
  if (!analyticsEndpoint() || analyticsConsent() !== "yes") return;
  const key = `store-purchase-analytics:${orderId}`;
  if (pendingPurchases.has(key)) return;
  try {
    if (localStorage.getItem(key)) return;
    pendingPurchases.add(key);
    if (await sendAnalytics({ event: "purchase", amount, currency }))
      localStorage.setItem(key, "sent");
  } catch {
    // Storage failures must not interrupt an accepted purchase.
  } finally {
    pendingPurchases.delete(key);
  }
}
