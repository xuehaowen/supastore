import { test, expect } from "./fixtures";

test("product navigation shows a skeleton while the response is pending", async ({
  page,
}) => {
  await page.route("**/en/products/studio-cup*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await page.goto("/en/search?q=cup");
  await page
    .locator(".storefront-product-meta")
    .getByRole("heading", { name: "Studio cup", exact: true })
    .click();
  await expect(page.locator('[data-loading-page="product"]')).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Studio cup", exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-loading-page]")).toHaveCount(0);
});
