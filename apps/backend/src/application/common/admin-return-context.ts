import {
  ORDER_FILTER_KEYS,
  parseOrderFilters,
} from "@/domain/catalog/order-filters";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const statuses = ["unpaid", "confirmed", "completed", "cancelled"];
export function adminReturnContext(requested: string) {
  if (
    requested.length > 2048 ||
    !requested.startsWith("/") ||
    requested.startsWith("//") ||
    /[\\\u0000-\u001f\u007f]/.test(requested)
  )
    return "/admin";
  const url = new URL(requested, "https://admin.invalid");
  if (
    url.origin !== "https://admin.invalid" ||
    !(
      [
        "/admin",
        "/admin/orders",
        "/admin/payments",
        "/admin/fulfillment",
        "/admin/inventory",
      ].includes(url.pathname) ||
      (/^\/admin\/orders\/[0-9a-f-]{36}$/i.test(url.pathname) &&
        uuid.test(url.pathname.split("/").at(-1)!))
    )
  )
    return "/admin";
  const query = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    let orderFilterValid = false;
    if ((ORDER_FILTER_KEYS as readonly string[]).includes(key)) {
      try {
        orderFilterValid = Boolean(
          Object.keys(parseOrderFilters(new URLSearchParams({ [key]: value })))
            .length,
        );
      } catch {
        /* Drop invalid return parameters. */
      }
    }
    const valid =
      orderFilterValid ||
      (["q", "paymentQ"].includes(key) && value.length <= 120) ||
      (["status", "paymentStatus"].includes(key) &&
        (statuses.includes(value) ||
          (url.pathname === "/admin/inventory" &&
            ["low", "shortage"].includes(value)))) ||
      (key === "work" &&
        ["active", "prepare", "ready", "transit", "completed", "all"].includes(
          value,
        )) ||
      (key === "paymentType" &&
        ["cash", "zelle", "venmo", "other"].includes(value)) ||
      (["manage", "managePayment", "reviewEvidence"].includes(key) &&
        uuid.test(value)) ||
      ([
        "page",
        "paymentPage",
        "payoutPage",
        "evidencePage",
        "failurePage",
        "fulfillmentPage",
      ].includes(key) &&
        /^[1-9]\d*$/.test(value) &&
        Number.isSafeInteger(Number(value)) &&
        Number(value) <= Math.floor(Number.MAX_SAFE_INTEGER / 50));
    if (valid) query.set(key, value);
  }
  if (
    /^\/admin\/orders\/[0-9a-f-]{36}$/i.test(url.pathname) &&
    url.searchParams.has("back")
  ) {
    query.set("back", adminListReturnContext(url.searchParams.get("back")!));
  }
  const hash =
    /^#order-(?:payment-)?[0-9a-f-]{36}$/i.test(url.hash) &&
    uuid.test(url.hash.replace(/^#order-(?:payment-)?/, ""))
      ? url.hash
      : "";
  return url.pathname + (query.size ? `?${query}` : "") + hash;
}
export function adminListReturnContext(
  requested: string,
  fallback = "/admin/orders",
) {
  const path = adminReturnContext(requested);
  return /^\/admin\/(?:orders|fulfillment|inventory)(?:\?|$)/.test(path)
    ? path
    : fallback;
}
export function adminOrderReturnContext(orderId: string, requested: string) {
  const fallback = uuid.test(orderId)
    ? `/admin/orders/${orderId}`
    : "/admin/orders";
  const safe = adminReturnContext(requested);
  return safe.split(/[?#]/, 1)[0] === fallback ? safe : fallback;
}
export function adminQueueReturnContext(
  path: string,
  query: Record<string, string | undefined>,
) {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (typeof value === "string") parameters.set(key, value);
  return adminReturnContext(`${path}?${parameters}`);
}
