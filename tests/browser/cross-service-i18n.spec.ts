import { test, expect } from "./fixtures";

test("separate Chinese storefront translates checkout, API errors, recovery and missing pages", async ({
  page,
}) => {
  await page.goto("/zh");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh");
  await page.goto("/zh/products/studio-cup");
  await page.getByRole("button", { name: "加入购物车", exact: true }).click();
  await page.getByRole("link", { name: "结账", exact: true }).click();
  await page.getByLabel("姓名", { exact: true }).fill("I18n customer");
  await page.getByLabel("邮箱", { exact: true }).fill("zh@example.test");
  await page.getByLabel("完整收货地址").fill("1 Customer Street");
  await page.getByLabel("州 / 省", { exact: true }).selectOption("CA");
  await expect(
    page.getByLabel("州 / 省", { exact: true }).locator("option:checked"),
  ).toHaveText("加利福尼亚州");
  await page.route("**/api/v1/quotes", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: { message: "We do not ship to this destination." },
      }),
    }),
  );
  await page.getByRole("button", { name: "核对最终金额", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("此地址不在配送范围内");
  await page.getByLabel("配送方式", { exact: true }).selectOption("pickup");
  const dateOption = page.locator('select[name="pickupDate"] option').nth(1);
  await expect(dateOption).toHaveText(/\d{4}年\d+月\d+日/);
  await expect(dateOption).toHaveAttribute("value", /^\d{4}-\d{2}-\d{2}$/);
  await page.goto("/recover/exchange?token=invalid&locale=zh");
  await expect(page).toHaveURL(/\/zh\/recover\?token=invalid/);
  await expect(page.locator("html")).toHaveAttribute("lang", "zh");
  await page.getByRole("button", { name: "打开订单", exact: true }).click();
  await expect(page.getByRole("status")).not.toContainText(
    /Invalid|Unable|Unauthorized/,
  );
  await page.goto("/zh/products/does-not-exist");
  // Missing backend products may render an error boundary rather than a 404.
  await expect(
    page
      .getByRole("heading")
      .filter({ hasText: /找不到页面|商店暂时无法访问/ }),
  ).toBeVisible();
});
