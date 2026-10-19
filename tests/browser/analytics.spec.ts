import { test, expect, checkout, record, confirm } from "./fixtures";

test("consent controls the shopping funnel and confirmed purchase retries without leaking private data", async ({
  page,
  admin,
  sql,
}) => {
  test.skip(
    process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT !==
      "https://analytics.example.test/events",
    "Requires the intercepted synthetic analytics endpoint.",
  );
  const accepted: Record<string, unknown>[] = [];
  let purchaseAttempts = 0;
  await page.route("https://analytics.example.test/events", async (route) => {
    const request = route.request();
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    const payload = request.postDataJSON() as Record<string, unknown>;
    if (payload.event === "purchase" && ++purchaseAttempts === 1) {
      await route.fulfill({ status: 503, headers, body: "retry" });
      return;
    }
    accepted.push(payload);
    await route.fulfill({ status: 204, headers });
  });
  await page.goto("/en");
  await page.getByRole("button", { name: "Decline", exact: true }).click();
  await page.goto("/en/cart");
  await expect(
    page.getByRole("button", { name: "Change analytics preference" }),
  ).toBeVisible();
  expect(accepted).toEqual([]);
  await page
    .getByRole("button", { name: "Change analytics preference" })
    .click();
  await page
    .getByRole("button", { name: "Allow analytics", exact: true })
    .click();
  await expect
    .poll(() => accepted.some((event) => event.event === "view_cart"))
    .toBe(true);
  const order = await checkout(page, sql);
  expect(purchaseAttempts).toBe(0);
  await expect
    .poll(() => accepted.some((event) => event.event === "begin_checkout"))
    .toBe(true);
  await record(admin, order.reference_code, order.purchase_total_cents);
  await confirm(admin, order.reference_code);
  await page.reload();
  await expect.poll(() => purchaseAttempts).toBe(1);
  await page.reload();
  await expect
    .poll(() => accepted.filter((event) => event.event === "purchase").length)
    .toBe(1);
  expect(accepted.find((event) => event.event === "purchase")).toMatchObject({
    amount: order.purchase_total_cents / 100,
    currency: "USD",
  });
  await expect
    .poll(() =>
      page.evaluate(
        (id) => localStorage.getItem(`store-purchase-analytics:${id}`),
        order.id,
      ),
    )
    .toBe("sent");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Change analytics preference" }),
  ).toBeVisible();
  expect(purchaseAttempts).toBe(2);
  const serialized = JSON.stringify(accepted);
  expect(serialized).not.toContain(order.id);
  expect(serialized).not.toContain(order.reference_code);
  expect(serialized).not.toContain("/orders/");
  await page
    .getByRole("button", { name: "Change analytics preference" })
    .click();
  await page.getByRole("button", { name: "Decline", exact: true }).click();
  const count = accepted.length;
  await page.goto("/en/cart");
  await expect(
    page.getByRole("button", { name: "Change analytics preference" }),
  ).toBeVisible();
  expect(accepted).toHaveLength(count);
});
