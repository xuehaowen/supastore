import { test, expect } from "./fixtures";

test("catalog search preserves the document during navigation", async ({
  page,
}) => {
  await page.goto("/en");
  await page.evaluate(() => {
    (
      window as Window & { storefrontNavigationMarker?: string }
    ).storefrontNavigationMarker = "same-document";
  });
  await page.getByRole("textbox", { name: /Search/ }).fill("studio");
  await page.getByRole("button", { name: /Search/ }).click();
  await expect(page).toHaveURL(/\/en\/search\?.*q=studio/);
  await expect(
    page.locator(
      '.storefront-product-card > a[href="/en/products/studio-cup"]',
    ),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as Window & { storefrontNavigationMarker?: string })
          .storefrontNavigationMarker,
    ),
  ).toBe("same-document");
});

test("navigation and cart submission provide feedback during a slow response", async ({
  page,
}) => {
  let release = () => {};
  let waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.pathname === "/en/products/studio-cup" &&
      url.searchParams.has("_rsc")
    )
      await waiting;
    await route.continue();
  });
  await page.goto("/en");
  try {
    await page
      .locator(".storefront-product-card")
      .filter({
        has: page.getByRole("heading", { name: "Studio cup", exact: true }),
      })
      .locator(".storefront-product-image")
      .click();
    await expect(page.getByRole("status")).toHaveText("Please wait…");
    await expect(page.locator(".storefront-navigation-progress")).toBeVisible();
  } finally {
    release();
  }
  await expect(page).toHaveURL(/\/en\/products\/studio-cup$/);
  await expect(page.locator(".storefront-navigation-progress")).toHaveCount(0);
  await page.unroute("**/*");
  waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/en/products/studio-cup", async (route) => {
    if (route.request().method() === "POST") await waiting;
    await route.continue();
  });
  try {
    await page.locator('button[type="submit"]').click();
    const pending = page.getByRole("button", { name: /Please wait/ });
    await expect(pending).toBeDisabled();
    await expect(pending).toHaveAttribute("aria-busy", "true");
  } finally {
    release();
  }
  await expect(
    page.getByRole("link", { name: "View bag", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/en\/products\/studio-cup$/);
  await expect(page.locator("h1")).toBeVisible();
});

test("measure production storefront page response and navigation latency", async ({
  page,
  request,
}, info) => {
  const results: Record<string, unknown>[] = [];
  for (const [name, path, api] of [
    ["catalog", "/en", "catalog?locale=en"],
    [
      "product",
      "/en/products/studio-cup",
      "product?locale=en&handle=studio-cup",
    ],
    ["cart", "/en/cart", "cart?locale=en"],
  ]) {
    const backendMs: number[] = [];
    const documentMs: number[] = [];
    for (let sample = 0; sample < 8; sample++) {
      let started = performance.now();
      const backend = await request.get(
        `http://127.0.0.1:3102/api/v1/customer-pages/${api}`,
      );
      await backend.body();
      backendMs.push(Math.round(performance.now() - started));
      expect(backend.ok()).toBeTruthy();
      started = performance.now();
      const response = await request.get(path!);
      await response.body();
      documentMs.push(Math.round(performance.now() - started));
      expect(response.ok()).toBeTruthy();
    }
    await page.goto(path!, { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toBeVisible();
    const navigation = await page.evaluate(() => {
      const entry = performance.getEntriesByType(
        "navigation",
      )[0] as PerformanceNavigationTiming;
      return {
        ttfbMs: Math.round(entry.responseStart - entry.startTime),
        domContentLoadedMs: Math.round(
          entry.domContentLoadedEventEnd - entry.startTime,
        ),
      };
    });
    const median = (values: number[]) =>
      [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    results.push({
      name,
      coldDocumentMs: documentMs[0],
      warmDocumentMedianMs: median(documentMs.slice(1)),
      warmBackendMedianMs: median(backendMs.slice(1)),
      documentMs,
      backendMs,
      navigation,
    });
  }
  await info.attach("storefront-performance", {
    body: JSON.stringify(
      { environment: "isolated local production, synthetic data", results },
      null,
      2,
    ),
    contentType: "application/json",
  });
  console.log("STOREFRONT_PERFORMANCE " + JSON.stringify(results));
});
