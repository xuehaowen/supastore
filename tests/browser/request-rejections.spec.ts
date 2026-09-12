import { expect, test } from "@playwright/test";

test.describe("request rejection flows", () => {
  test("customer sees a readable error for an invalid cart quantity", async ({ page }) => {
    await page.goto("/en/products/everyday-shirt");
    await page.getByRole("button", { name: "Add to bag" }).click();
    await expect(page.getByRole("heading", { name: "Your bag" })).toBeVisible();
    const quantity = page.locator('input[name="quantity"]').first();
    await quantity.evaluate((input) => input.removeAttribute("min"));
    await quantity.fill("-1");
    await quantity.locator("xpath=ancestor::form").getByRole("button", { name: "Update" }).click();
    await expect(page.getByText("Quantity must be at least 0.")).toBeVisible();
  });

  test("admin cannot complete pickup handoff before readiness", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Email", { exact: true }).fill("owner@example.test");
    await page.getByLabel("Password").fill(process.env.DEMO_OWNER_PASSWORD!);
    await page.getByRole("button", { name: "Sign in securely", exact: true }).click();
    await expect(page).toHaveURL(/admin(?:\/setup)?$/);
    await page.goto("/admin");
    const pickup = page.locator("#ready details").first();
    if (await pickup.count()) {
      await pickup.getByLabel("Recipient / authorized recipient").fill("Test Customer");
      await pickup.getByRole("button", { name: "Complete pickup handoff" }).click();
      await expect(page.getByText("Pickup must be marked ready before handoff.")).toBeVisible();
    }
  });
});
