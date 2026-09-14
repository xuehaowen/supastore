import { expect, test, checkout, openOrder, record, confirm } from "./fixtures";

test.describe("request rejection flows", () => {
  test("customer sees a readable error for an invalid cart quantity", async ({
    page,
  }) => {
    await page.goto("/en/products/everyday-shirt");
    await page.getByRole("button", { name: "Add to bag" }).click();
    await expect(page.getByRole("heading", { name: "Your bag" })).toBeVisible();
    const quantity = page.locator('input[name="quantity"]').first();
    await quantity.evaluate((input) => input.removeAttribute("min"));
    await quantity.fill("-1");
    await quantity
      .locator("xpath=ancestor::form")
      .getByRole("button", { name: "Update" })
      .click();
    await expect(page.getByText("Quantity must be at least 0.")).toBeVisible();
  });

  test("add-to-bag rejects a zero quantity after client constraints are removed", async ({
    page,
  }) => {
    await page.goto("/en/products/studio-cup");
    const quantity = page.locator('input[name="quantity"]');
    await quantity.evaluate((input) => {
      input.removeAttribute("min");
      input.closest("form")!.noValidate = true;
    });
    await quantity.fill("0");
    await page.getByRole("button", { name: "Add to bag" }).click();
    await expect(page.locator('[data-slot="alert"]')).toContainText(
      "Quantity must be at least 1.",
    );
  });

  test("checkout rejects an unsupported fulfillment type", async ({ page }) => {
    await page.goto("/en/products/studio-cup");
    await page.getByRole("button", { name: "Add to bag" }).click();
    await page.getByRole("link", { name: "Continue to checkout" }).click();
    await page.getByLabel("Street address").fill("1 Test Street");
    await page
      .getByLabel("Payment method")
      .selectOption({ label: "Demo bank transfer" });
    await page
      .locator('input[name="fulfillmentType"][value="shipping"]')
      .evaluate((input) => {
        (input as HTMLInputElement).value = "courier";
        input.closest("form")!.noValidate = true;
      });
    await page.getByRole("button", { name: /Review your order/ }).click();
    await expect(page.locator('[data-slot="alert"]')).toContainText(
      "Fulfillment is invalid.",
    );
  });

  test("recovery rejects an invalid email instead of claiming a link was sent", async ({
    page,
  }) => {
    await page.goto("/recover");
    const email = page.getByLabel("Email", { exact: true });
    await email.evaluate((input) => {
      input.removeAttribute("type");
      input.closest("form")!.noValidate = true;
    });
    await email.fill("not-an-email");
    await page.getByLabel("Payment reference").fill("SP-NOTFOUND");
    await page.getByRole("button", { name: "Send recovery link" }).click();
    await expect(page.locator('[data-slot="alert"]')).toBeVisible();
    await expect(
      page.getByText("If an order was found, a recovery link has been sent."),
    ).toHaveCount(0);
  });

  test("evidence upload requires a file before calling the API", async ({
    page,
    sql,
  }) => {
    await checkout(page, sql);
    await page.route("**/api/evidence**", () => {
      throw new Error("upload should not start without a file");
    });
    await page.locator('input[name="file"]').evaluate((input) => {
      input.removeAttribute("required");
      input.closest("form")!.noValidate = true;
    });
    await page
      .getByRole("button", { name: "Upload evidence", exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText(
      "Choose an image to upload.",
    );
  });

  test("admin sign-in stays on login after incorrect credentials", async ({
    page,
  }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Email", { exact: true }).fill("owner@example.test");
    await page.getByLabel("Password").fill("definitely-not-the-password");
    await page
      .getByRole("button", { name: "Sign in securely", exact: true })
      .click();
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByRole("alert")).toBeVisible();
  });

  test("admin cannot complete pickup handoff before readiness", async ({
    page,
    admin,
    sql,
  }) => {
    const order = await checkout(page, sql, { free: true, pickup: true });
    const pickup = await openOrder(admin, order.reference_code);
    await pickup
      .getByLabel("Recipient / authorized recipient")
      .fill("Test Customer");
    await pickup
      .getByRole("button", { name: "Complete pickup handoff" })
      .click();
    await expect(
      admin.getByText("Pickup must be marked ready before handoff."),
    ).toBeVisible();
  });

  test("refund authorization rejects a zero amount", async ({
    page,
    admin,
    sql,
  }) => {
    const order = await checkout(page, sql);
    await record(admin, order.reference_code, order.purchase_total_cents);
    await confirm(admin, order.reference_code);
    const confirmed = await openOrder(admin, order.reference_code);
    const amount = confirmed.getByLabel("Refund amount (minor units)");
    await amount.evaluate((input) => {
      input.removeAttribute("min");
      input.closest("form")!.noValidate = true;
    });
    await amount.fill("0");
    await confirmed.getByLabel("Refund reason").fill("Zero refund attempt");
    await confirmed
      .getByRole("button", { name: "Authorize refund", exact: true })
      .click();
    await expect(admin.locator('[data-slot="alert"]')).toContainText(
      "Refund amount must be at least 1.",
    );
  });

  test("category create rejects an invalid handle", async ({ admin }) => {
    await admin.goto("/admin/products");
    await admin.getByLabel("Category name").fill("Bad category");
    const slug = admin.getByLabel("Category handle");
    await slug.evaluate((input) => {
      input.closest("form")!.noValidate = true;
    });
    await slug.fill("Invalid Slug");
    await admin.getByRole("button", { name: "Add category" }).click();
    await expect(admin.locator('[data-slot="alert"]')).toContainText(
      "Enter a category name and valid URL handle.",
    );
  });
});
