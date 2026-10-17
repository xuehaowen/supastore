import { test, expect, clientHeaders } from "./fixtures";
import { writeFileSync } from "node:fs";
import type { CDPSession, Page } from "@playwright/test";
import { verifyFixtureOwnership } from "../../scripts/benchmark/seed";
import {
  summarizeTransfers,
  summarizeBrowserSamples,
  type BrowserSample,
} from "../../scripts/benchmark/browser-metrics";

test.skip(
  !process.env.BENCHMARK_REPORT_PATH || !process.env.BENCHMARK_OWNER_TOKEN,
  "Representative measurements require the freshly owned benchmark harness.",
);

type Transfer = {
  kind: "html" | "rsc" | "script" | "image" | "other";
  encodedBytes: number;
  status: number | null;
  fromCache: boolean;
  canceled?: boolean;
};
function recorder(session: CDPSession) {
  const pending = new Map<string, Omit<Transfer, "encodedBytes">>();
  let finished: Transfer[] = [];
  const kind = (mime: string, type: string): Transfer["kind"] =>
    mime.startsWith("text/x-component")
      ? "rsc"
      : mime.startsWith("text/html")
        ? "html"
        : type === "Script"
          ? "script"
          : type === "Image" || mime.startsWith("image/")
            ? "image"
            : "other";
  session.on(
    "Network.requestWillBeSent",
    (event: { requestId: string; type?: string }) => {
      if (pending.size + finished.length > 1000)
        throw new Error("Unexpected browser request volume");
      pending.set(event.requestId, {
        kind: kind("", event.type ?? "Other"),
        status: null,
        fromCache: false,
      });
    },
  );
  session.on(
    "Network.requestServedFromCache",
    (event: { requestId: string }) => {
      const row = pending.get(event.requestId);
      if (row) row.fromCache = true;
    },
  );
  session.on(
    "Network.responseReceived",
    (event: {
      requestId: string;
      type: string;
      response: {
        mimeType: string;
        status: number;
        fromDiskCache?: boolean;
        fromServiceWorker?: boolean;
      };
    }) => {
      pending.set(event.requestId, {
        kind: kind(event.response.mimeType, event.type),
        status: event.response.status,
        fromCache: Boolean(
          pending.get(event.requestId)?.fromCache ||
          event.response.fromDiskCache ||
          event.response.fromServiceWorker,
        ),
      });
    },
  );
  session.on(
    "Network.loadingFinished",
    (event: { requestId: string; encodedDataLength: number }) => {
      const row = pending.get(event.requestId);
      if (row) finished.push({ ...row, encodedBytes: event.encodedDataLength });
      pending.delete(event.requestId);
    },
  );
  session.on(
    "Network.loadingFailed",
    (event: { requestId: string; canceled?: boolean }) => {
      const row = pending.get(event.requestId);
      if (row)
        finished.push({
          ...row,
          encodedBytes: 0,
          canceled: Boolean(event.canceled),
        });
      pending.delete(event.requestId);
    },
  );
  return {
    reset() {
      if (pending.size)
        throw new Error("Browser requests still pending at sample boundary");
      finished = [];
    },
    summary() {
      return summarizeTransfers(finished);
    },
  };
}
async function settle(page: Page) {
  await expect(page.locator("main")).toBeVisible();
  if (await page.locator("img").count())
    await expect
      .poll(() =>
        page
          .locator("img")
          .first()
          .evaluate(
            (image) =>
              image instanceof HTMLImageElement &&
              image.complete &&
              image.naturalWidth > 0,
          ),
      )
      .toBe(true);
  await page.waitForLoadState("networkidle");
}

test("representative cold/warm browser transfers and private HTTP boundaries", async ({
  browser,
  sql,
}) => {
  test.setTimeout(240000);
  const token = process.env.BENCHMARK_OWNER_TOKEN ?? "";
  const output = process.env.BENCHMARK_REPORT_PATH;
  if (!output) throw new Error("Use the owned representative benchmark runner");
  await sql.begin((tx) =>
    verifyFixtureOwnership(tx, process.env.DATABASE_URL ?? "", token),
  );
  const [variant] =
    await sql`select v.id,p.handle from product_variants v join products p on p.id=v.product_id order by p.handle,v.sort_order limit 1`;
  const headers = { ...clientHeaders(), Origin: "http://localhost:3103" };
  const samples: BrowserSample[] = [];
  const routes = [
    ["catalog", "/en"],
    ["search", "/en/search?q=Bakery&category=benchmark-category-1"],
    ["product", "/en/products/" + variant!.handle],
    ["cart", "/en/cart"],
    ["checkout", "/en/checkout"],
  ] as const;
  for (const [route, path] of routes)
    for (let iteration = 0; iteration < 3; iteration++) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        hasTouch: true,
        extraHTTPHeaders: headers,
      });
      try {
        const cart = await context.request.post(
          "http://localhost:3103/api/v1/cart",
          { data: { variantId: variant!.id, quantity: 1 } },
        );
        expect(cart.status()).toBe(200);
        const page = await context.newPage();
        const session = await context.newCDPSession(page);
        await session.send("Network.enable");
        // Cold means browser HTTP cache only. Server readiness/previous routes warm server caches.
        await session.send("Network.clearBrowserCache");
        const transfers = recorder(session);
        for (const cache of ["cold", "warm"] as const) {
          transfers.reset();
          const response =
            cache === "cold"
              ? await page.goto("http://localhost:3103" + path)
              : await page.reload();
          expect(response?.status()).toBe(200);
          await settle(page);
          if (route === "cart" || route === "checkout")
            await expect(page.locator("main")).toContainText("Bakery loaf");
          const timing = await page.evaluate(() => {
            const nav = performance.getEntriesByType(
              "navigation",
            )[0] as PerformanceNavigationTiming;
            return {
              ttfbMs: nav.responseStart - nav.requestStart,
              domContentLoadedMs: nav.domContentLoadedEventEnd - nav.startTime,
            };
          });
          const network = transfers.summary();
          expect(network.unexpectedFailures).toBe(0);
          samples.push({ route, cache, ...timing, transfers: network });
        }
      } finally {
        await context.close();
      }
    }
  // Includes the source page and its prefetch traffic, followed by a client transition.
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    extraHTTPHeaders: headers,
  });
  let clientNavigation;
  try {
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    await session.send("Network.enable");
    const transfers = recorder(session);
    await page.goto("http://localhost:3103/en");
    await settle(page);
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).__benchmarkWindow = true;
    });
    await page.locator('a[href*="/products/"]').first().click();
    await expect(page).toHaveURL(/\/en\/products\//);
    await settle(page);
    expect(
      await page.evaluate(
        () => (window as unknown as Record<string, unknown>).__benchmarkWindow,
      ),
    ).toBe(true);
    clientNavigation = transfers.summary();
    expect(clientNavigation.unexpectedFailures).toBe(0);
    expect(clientNavigation.encodedBytes.rsc).toBeGreaterThan(0);
    // HTML fallback or duplicated full navigation is not silently called RSC success.
  } finally {
    await context.close();
  }
  const unauthorized = await browser.newContext({ extraHTTPHeaders: headers });
  let authorization;
  try {
    const [order] = await sql`select id from orders order by id limit 1`;
    const denied = await unauthorized.request.get(
      "http://localhost:3103/api/v1/orders/" + order!.id,
    );
    expect(denied.status()).toBe(401);
    const originDenied = await unauthorized.request.post(
      "http://localhost:3103/api/v1/cart",
      {
        headers: { Origin: "https://untrusted.example" },
        data: { variantId: variant!.id, quantity: 1 },
      },
    );
    expect(originDenied.status()).toBe(403);
    authorization = {
      privateOrderStatus: denied.status(),
      untrustedOriginStatus: originDenied.status(),
    };
  } finally {
    await unauthorized.close();
  }
  writeFileSync(
    output + "/browser.json",
    JSON.stringify(
      {
        scope: "representative-browser-diagnostic",
        browser: browser.version(),
        viewport: { width: 390, height: 844 },
        network: "local loopback, no latency or CPU emulation",
        cold: "fresh context and cleared browser HTTP cache; server already started",
        samplesPerRouteAndCache: 3,
        summary: summarizeBrowserSamples(samples),
        samples,
        clientNavigation,
        clientNavigationScope:
          "source catalog load, prefetch and product transition combined",
        authorization,
      },
      null,
      2,
    ),
  );
});
