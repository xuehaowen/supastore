import { expect, it } from "vitest";
import { parseBenchmarkOptions } from "../../scripts/benchmark/options.mjs";
import { LoadMetrics, shoppingCycle } from "../../scripts/benchmark/http-load";

it("keeps standard timing fixed and labels smoke/profile diagnostics", () => {
  expect(parseBenchmarkOptions([])).toBeNull();
  expect(parseBenchmarkOptions(["--benchmark"])).toMatchObject({
    mode: "standard",
    products: 1000,
    warmupSeconds: 300,
    measurementSeconds: 1800,
  });
  expect(parseBenchmarkOptions(["--benchmark", "--smoke"])).toMatchObject({
    mode: "smoke",
    warmupSeconds: 5,
    measurementSeconds: 30,
  });
  expect(
    parseBenchmarkOptions([
      "--benchmark",
      "--products=100",
      "--fulfillment=pickup",
      "--stock=untracked",
      "--rewards=off",
    ]),
  ).toMatchObject({
    mode: "profile-diagnostic",
    products: 100,
    fulfillment: "pickup",
    trackedStock: false,
    rewards: false,
  });
});
it.each([
  ["--benchmark", "--duration=1"],
  ["--benchmark", "--products=1"],
  ["--benchmark", "--smoke", "--smoke"],
  ["--benchmark", "--stock=false"],
  ["--benchmark", "--fulfillment=shipping", "--fulfillment=pickup"],
])("rejects unsupported/duplicated benchmark overrides %#", (args) => {
  expect(() => parseBenchmarkOptions(args)).toThrow(
    "Invalid benchmark options",
  );
});

it("keeps bounded latency distributions and separates expected conflicts from errors", () => {
  const metrics = new LoadMetrics();
  for (let i = 1; i <= 100; i++) metrics.record("catalog", i, 200, i);
  metrics.record("order", 10, 409, 0, true);
  metrics.record("order", 15, 500, 0, true);
  metrics.record("cart", 20, null, 0);
  const report = metrics.report(10);
  expect(report).toMatchObject({
    requests: 103,
    successes: 100,
    expectedConflicts: 1,
    unexpectedFailures: 2,
    requestsPerSecond: 10.3,
  });
  expect(report.operations.catalog).toMatchObject({
    p50Ms: 50,
    p95Ms: 95,
    decodedBodyBytes: 5050,
  });
  expect(report.operations.order.p50Ms).toBeNull();
  metrics.record("catalog", 100000, 200, 0);
  expect(metrics.report(10).operations.catalog.overflowCount).toBe(1);
});
it("does not excuse read authorization failures as expected purchase conflicts", () => {
  const metrics = new LoadMetrics();
  metrics.record("catalog", 1, 409, 0, true);
  expect(metrics.report(1).unexpectedFailures).toBe(1);
});
it("rejects corrupt metric inputs", () => {
  const metrics = new LoadMetrics();
  expect(() => metrics.record("catalog", NaN, 200, 0)).toThrow();
  expect(() => metrics.record("catalog", 1, 200, -1)).toThrow();
  expect(() => metrics.report(0)).toThrow();
});

it("drives the fixed 80/20 mix with one bounded cart cookie per cycle", async () => {
  const calls: {
    operation: string;
    path: string;
    cookie: string;
    body: unknown;
  }[] = [];
  const request = async (
    operation: string,
    path: string,
    method: string,
    body: unknown,
    cookie: string,
  ) => {
    calls.push({ operation, path, body, cookie });
    if (method === "POST" && path.endsWith("/cart"))
      return {
        data: { id: "cart", items: [{ id: "item" }] },
        cartCookie: "shop-cart=synthetic",
      };
    if (path.endsWith("/quotes"))
      return { data: { id: "quote", totalPayableCents: 2400 } };
    if (path.endsWith("/orders"))
      return { data: { id: "order", purchaseTotalCents: 2400 } };
    return { data: null };
  };
  await shoppingCycle(
    {
      variantId: "variant",
      handle: "benchmark-product-1",
      priceCents: 1200,
      paymentAccountId: "bank",
      pickupLocationId: "location",
      fulfillment: "shipping",
    },
    request,
    () => true,
  );
  expect(calls).toHaveLength(20);
  const shares = calls.reduce<Record<string, number>>((result, call) => {
    result[call.operation] = (result[call.operation] ?? 0) + 5;
    return result;
  }, {});
  expect(shares).toEqual({
    catalog: 30,
    search: 20,
    product: 15,
    cart: 10,
    checkout: 5,
    cartEdit: 10,
    quote: 5,
    order: 5,
  });
  expect(calls[0]!.cookie).toBe("");
  expect(
    calls.slice(1).every((call) => call.cookie === "shop-cart=synthetic"),
  ).toBe(true);
  expect(calls.at(-1)!.body).toMatchObject({
    quoteId: "quote",
    accepted: true,
  });
});
it("does not issue later writes after the phase deadline", async () => {
  let requests = 0;
  await shoppingCycle(
    {
      variantId: "variant",
      handle: "p",
      priceCents: 1,
      paymentAccountId: "bank",
      pickupLocationId: "location",
      fulfillment: "pickup",
    },
    async () => {
      requests++;
      return { data: null };
    },
    () => false,
  );
  expect(requests).toBe(0);
});
