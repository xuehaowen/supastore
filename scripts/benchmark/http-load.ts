export const operations = [
  "catalog",
  "search",
  "product",
  "cart",
  "checkout",
  "cartEdit",
  "quote",
  "order",
] as const;
export type Operation = (typeof operations)[number];
const maxLatencyMs = 60000;
const mutations = new Set<Operation>(["cartEdit", "quote", "order"]);
function bucket() {
  return {
    requests: 0,
    successes: 0,
    expectedConflicts: 0,
    unexpectedFailures: 0,
    decodedBodyBytes: 0,
    overflowCount: 0,
    histogram: new Uint32Array(maxLatencyMs + 1),
  };
}
/** Fixed-size histograms: successful-response quantiles rounded up to 1 ms. */
export class LoadMetrics {
  private readonly rows = Object.fromEntries(
    operations.map((operation) => [operation, bucket()]),
  ) as Record<Operation, ReturnType<typeof bucket>>;
  record(
    operation: Operation,
    latencyMs: number,
    status: number | null,
    bytes: number,
    expectedConflict = false,
  ) {
    if (
      !operations.includes(operation) ||
      !Number.isFinite(latencyMs) ||
      latencyMs < 0 ||
      !Number.isSafeInteger(bytes) ||
      bytes < 0 ||
      (status !== null &&
        (!Number.isInteger(status) || status < 100 || status > 599))
    )
      throw new Error("Invalid benchmark observation");
    const row = this.rows[operation];
    row.requests++;
    row.decodedBodyBytes += bytes;
    if (status !== null && status >= 200 && status < 300) {
      row.successes++;
      if (latencyMs > maxLatencyMs) row.overflowCount++;
      else row.histogram[Math.ceil(latencyMs)]!++;
    } else if (expectedConflict && mutations.has(operation) && status === 409)
      row.expectedConflicts++;
    else row.unexpectedFailures++;
  }
  report(durationSeconds: number) {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
      throw new Error("Invalid benchmark duration");
    const quantile = (row: ReturnType<typeof bucket>, fraction: number) => {
      if (!row.successes) return null;
      const target = Math.ceil(row.successes * fraction);
      let count = 0;
      for (let ms = 0; ms <= maxLatencyMs; ms++) {
        count += row.histogram[ms]!;
        if (count >= target) return ms;
      }
      return null; // Explicit overflow, never silently cap a slow percentile.
    };
    const result = Object.fromEntries(
      operations.map((operation) => {
        const { histogram: _, ...counts } = this.rows[operation];
        return [
          operation,
          {
            ...counts,
            p50Ms: quantile(this.rows[operation], 0.5),
            p95Ms: quantile(this.rows[operation], 0.95),
          },
        ];
      }),
    ) as Record<
      Operation,
      Omit<ReturnType<typeof bucket>, "histogram"> & {
        p50Ms: number | null;
        p95Ms: number | null;
      }
    >;
    const rows = Object.values(result);
    const sum = (
      key:
        "requests" | "successes" | "expectedConflicts" | "unexpectedFailures",
    ) => rows.reduce((total, row) => total + row[key], 0);
    return {
      durationSeconds,
      requests: sum("requests"),
      successes: sum("successes"),
      expectedConflicts: sum("expectedConflicts"),
      unexpectedFailures: sum("unexpectedFailures"),
      requestsPerSecond: sum("requests") / durationSeconds,
      operations: result,
    };
  }
}

export interface CycleInput {
  variantId: string;
  handle: string;
  priceCents: number;
  paymentAccountId: string;
  pickupLocationId: string;
  fulfillment: "shipping" | "pickup";
}
export type BenchmarkRequest = (
  operation: Operation,
  path: string,
  method: string,
  body: unknown,
  cookie: string,
) => Promise<{ data: unknown; cartCookie?: string }>;
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid benchmark response");
  return value as Record<string, unknown>;
};
const identifier = (value: unknown) => {
  if (typeof value !== "string" || !value)
    throw new Error("Missing benchmark response identity");
  return value;
};
// A whole cycle has exactly the version-1 mix. A deadline can leave a partial cycle.
const cycle: readonly Operation[] = [
  "cartEdit",
  "catalog",
  "search",
  "product",
  "cart",
  "catalog",
  "cartEdit",
  "search",
  "product",
  "checkout",
  "catalog",
  "search",
  "quote",
  "cart",
  "catalog",
  "product",
  "search",
  "catalog",
  "catalog",
  "order",
];
export async function shoppingCycle(
  input: CycleInput,
  request: BenchmarkRequest,
  active: () => boolean,
) {
  let cookie = "",
    cartId = "",
    itemId = "",
    quoteId = "";
  let edits = 0;
  for (const operation of cycle) {
    if (!active()) return;
    let path = "/en",
      method = "GET",
      body: unknown;
    if (operation === "search")
      path = "/en/search?q=Bakery&category=benchmark-category-1";
    if (operation === "product")
      path = "/en/products/" + encodeURIComponent(input.handle);
    if (operation === "cart") path = "/en/cart";
    if (operation === "checkout") path = "/en/checkout";
    if (operation === "cartEdit") {
      path = "/api/v1/cart";
      method = edits++ === 0 ? "POST" : "PATCH";
      body =
        method === "POST"
          ? { variantId: input.variantId, quantity: 1, locale: "en" }
          : { itemId, quantity: 2, locale: "en" };
    }
    if (operation === "quote") {
      path = "/api/v1/quotes";
      method = "POST";
      body = {
        cartId,
        fulfillmentType: input.fulfillment,
        country: "US",
        address: "1 Fixture Street",
        paymentAccountId: input.paymentAccountId,
        ...(input.fulfillment === "pickup"
          ? { pickupLocationId: input.pickupLocationId }
          : {}),
      };
    }
    if (operation === "order") {
      path = "/api/v1/orders";
      method = "POST";
      body = {
        quoteId,
        accepted: true,
        name: "Synthetic buyer",
        email: "load@example.test",
        locale: "en",
      };
    }
    const response = await request(operation, path, method, body, cookie);
    if (operation === "cartEdit" && method === "POST") {
      cookie = identifier(response.cartCookie);
      const cart = object(response.data);
      cartId = identifier(cart.id);
      if (!Array.isArray(cart.items) || cart.items.length !== 1)
        throw new Error("Unexpected benchmark cart contents");
      itemId = identifier(object(cart.items[0]).id);
    }
    if (operation === "quote") {
      const quote = object(response.data);
      quoteId = identifier(quote.id);
      if (quote.totalPayableCents !== input.priceCents * 2)
        throw new Error("Benchmark quote total mismatch");
    }
    if (operation === "order") {
      const order = object(response.data);
      identifier(order.id);
      if (order.purchaseTotalCents !== input.priceCents * 2)
        throw new Error("Benchmark order total mismatch");
    }
  }
}
