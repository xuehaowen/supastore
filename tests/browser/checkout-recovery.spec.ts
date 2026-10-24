import { test, expect } from "./fixtures";

async function openCheckout(page: import("@playwright/test").Page) {
  await page.goto("/en/products/studio-cup");
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await page.getByRole("link", { name: "View bag", exact: true }).click();
  await page.getByRole("link", { name: "Continue to checkout" }).click();
}

test("checkout restores a tab draft after refresh and browsing, and can clear it", async ({
  page,
}) => {
  await openCheckout(page);
  await page.getByLabel("Recipient name", { exact: true }).fill("Alex Chen");
  await page.getByLabel("Street address", { exact: true }).fill("12 Main St");
  await page.getByLabel("City", { exact: true }).fill("Oakland");
  await page.getByLabel("State / region", { exact: true }).selectOption("CA");
  await page.getByLabel("ZIP / postal code", { exact: true }).fill("94612");
  await expect(
    page.getByText("Your details can be restored in this tab for 30 minutes."),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Street address", { exact: true })).toHaveValue(
    "12 Main St",
  );
  await expect(
    page.getByText(/Your saved details have been restored/),
  ).toBeVisible();
  await page.goto("/en/search?q=cup");
  await page.goto("/en/checkout");
  await expect(page.getByLabel("City", { exact: true })).toHaveValue("Oakland");
  const stored = await page.evaluate(() =>
    Object.entries(sessionStorage).filter(([key]) =>
      key.startsWith("store-checkout-draft:"),
    ),
  );
  expect(stored).toHaveLength(1);
  expect(stored[0]![1]).not.toContain("paymentAccountId");
  await page.getByRole("button", { name: "Clear saved details" }).click();
  await expect(page.getByLabel("Street address", { exact: true })).toHaveValue(
    "",
  );
  await page.reload();
  await expect(page.getByLabel("City", { exact: true })).toHaveValue("");
});

test("expired drafts are discarded", async ({ page }) => {
  await openCheckout(page);
  await page
    .getByLabel("Street address", { exact: true })
    .fill("Expired address");
  await expect(
    page.getByRole("button", { name: "Clear saved details" }),
  ).toBeVisible();
  await page.evaluate(() => {
    const key = Object.keys(sessionStorage).find((key) =>
      key.startsWith("store-checkout-draft:"),
    )!;
    const draft = JSON.parse(sessionStorage.getItem(key)!);
    draft.savedAt = Date.now() - 31 * 60 * 1000;
    sessionStorage.setItem(key, JSON.stringify(draft));
  });
  await page.reload();
  await expect(page.getByLabel("Street address", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    page.getByRole("button", { name: "Clear saved details" }),
  ).toHaveCount(0);
});

test("successful checkout clears its draft and an old confirmation cannot clear a newer one", async ({
  page,
}) => {
  await openCheckout(page);
  await page
    .getByLabel("Street address", { exact: true })
    .fill("1 Test Street");
  await page
    .getByLabel("Payment method")
    .selectOption({ label: "Demo bank transfer" });
  await page.getByRole("button", { name: /Review your order/ }).click();
  await page.getByLabel("Your name").fill("Draft Customer");
  await page.getByLabel("Email address").fill("draft@example.test");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: /Accept total & place order/ })
    .click();
  await expect(page).toHaveURL(/\/en\/orders\/[0-9a-f-]+$/);
  expect(
    await page.evaluate(() =>
      Object.keys(sessionStorage).filter((key) =>
        key.startsWith("store-checkout-draft:"),
      ),
    ),
  ).toEqual([]);
  const orderUrl = page.url();
  await openCheckout(page);
  await page
    .getByLabel("Street address", { exact: true })
    .fill("New checkout address");
  await expect(
    page.getByRole("button", { name: "Clear saved details" }),
  ).toBeVisible();
  await page.goto(orderUrl + "?placed=old-token");
  await expect(page).toHaveURL(/\/en\/orders\/[0-9a-f-]+$/);
  await page.goto("/en/checkout");
  await expect(page.getByLabel("Street address", { exact: true })).toHaveValue(
    "New checkout address",
  );
});
