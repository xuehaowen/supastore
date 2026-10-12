import assert from "node:assert/strict";
const origin = process.env.SMOKE_ORIGIN || "http://localhost:3097";
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))
  throw new Error("Smoke test requires a local fixture origin.");
const cookies = new Map();
async function request(path, options = {}) {
  const response = await fetch(origin + path, {
    ...options,
    headers: {
      Origin: origin,
      Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
  for (const cookie of response.headers.getSetCookie()) {
    const [pair] = cookie.split(";");
    const separator = pair.indexOf("=");
    cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  return response;
}
async function api(path, body, method = "POST") {
  const response = await request(`/api/v1/${path}`, {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  return result.data;
}
assert.equal((await request("/api/health/ready")).status, 200);
const home = await request("/en");
assert.equal(home.status, 200);
assert.match(await home.text(), /Generic smoke store/);
const store = await api("store", undefined, "GET");
assert.equal(store.storeName, "Generic smoke store");
const reusableConnection = await request("/api/v1/catalog");
assert.notEqual(
  reusableConnection.headers.get("connection"),
  "close",
  "API proxy must allow persistent client connections",
);
await reusableConnection.arrayBuffer();
const catalog = await api("catalog", undefined, "GET");
const product = await api(
  `products/${catalog.items[0].handle}`,
  undefined,
  "GET",
);
const foreign = await request("/api/v1/cart", {
  method: "POST",
  headers: { Origin: "https://untrusted.example" },
  body: JSON.stringify({ variantId: product.variants[0].id, quantity: 1 }),
});
assert.equal(foreign.status, 403);
const cart = await api("cart", {
  variantId: product.variants[0].id,
  quantity: 1,
});
assert.ok(cookies.has("shop-cart"), "Cart proof cookie must survive the proxy");
assert.equal((await api("cart", undefined, "GET")).id, cart.id);
const quote = await api("quotes", {
  cartId: cart.id,
  fulfillmentType: "shipping",
  country: "US",
  address: "1 Fixture St",
  paymentAccountId: store.paymentMethods[0].id,
});
const order = await api("orders", {
  quoteId: quote.id,
  name: "Fixture Buyer",
  email: "buyer@example.test",
  accepted: true,
});
assert.ok(
  cookies.has(`shop-order-${order.id}`),
  "Private order proof cookie must survive the proxy",
);
const tracking = await api(`orders/${order.id}`, undefined, "GET");
assert.equal(tracking.order.id, order.id);
assert.equal(tracking.order.purchaseTotalCents, 1000);
assert.equal(
  (
    await api("orders", {
      quoteId: quote.id,
      name: "Fixture Buyer",
      email: "buyer@example.test",
      accepted: true,
    })
  ).id,
  order.id,
  "Order retry must return the original order",
);
const unauthorized = await fetch(`${origin}/api/v1/orders/${order.id}`, {
  signal: AbortSignal.timeout(15000),
});
assert.equal(unauthorized.status, 401);
assert.equal((await request("/api/v1/account")).status, 401);
const login = await request("/admin/login");
assert.equal(login.status, 200);
const html = await login.text();
const assets = [
  ...new Set(html.match(/\/backend-assets\/_next\/static\/[^"<> ]+/g) || []),
];
assert.ok(assets.length > 0, "Admin must use isolated backend asset URLs");
for (const asset of assets.slice(0, 3))
  assert.equal((await request(asset)).status, 200, asset);
console.log(
  JSON.stringify({
    passed: true,
    flows: [
      "readiness",
      "catalog",
      "api-keepalive",
      "cart-cookie",
      "quote",
      "order-idempotency",
      "private-order-cookie",
      "ownership",
      "csrf",
      "admin-assets",
    ],
  }),
);
