import { test, expect } from "./fixtures";
test("separate storefront owns catalog/cart checkout and private order cookies", async ({
  page,
  sql,
}) => {
  await page.goto("/en");
  await expect(page.locator("article h2 a").first()).toBeVisible();
  await page.locator("article h2 a").first().click();
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page).toHaveURL(/\/en\/cart$/);
  await expect(
    page.getByRole("heading", { name: "Cart", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Checkout", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Cross Service Customer");
  await page
    .getByLabel("Email", { exact: true })
    .fill("cross-service@example.test");
  await page
    .getByLabel("Fulfillment", { exact: true })
    .selectOption("shipping");
  await page.getByLabel("Country code", { exact: true }).fill("US");
  await page
    .getByLabel("Full shipping address")
    .fill("123 Synthetic Street, Seattle, WA 98101");
  await page.getByRole("button", { name: "Review final total" }).click();
  await expect(page.getByText("Order total:")).toBeVisible();
  await page.getByLabel("I accept this final total").check();
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/orders\/[a-f0-9-]+$/);
  const id = page.url().split("/").at(-1)!;
  const [order] =
    await sql`select id,guest_email,fulfillment_type from orders where id=${id}`;
  expect(order.guest_email).toBe("cross-service@example.test");
  expect(order.fulfillment_type).toBe("shipping");
  const cookies = await page.context().cookies();
  expect(
    cookies.some((cookie) => cookie.name === "shop-cart" && cookie.httpOnly),
  ).toBe(true);
  expect(
    cookies.some(
      (cookie) => cookie.name.startsWith("shop-order-") && cookie.httpOnly,
    ),
  ).toBe(true);
  const privateOrder = await page.request.get(`/api/v1/orders/${id}`);
  expect(privateOrder.ok()).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("cross-service-order.png"),
    fullPage: true,
  });
});
test("customer registration/login/profile mutation stays behind the backend API", async ({
  page,
  sql,
}) => {
  const email = `cross-auth-${Date.now()}@example.test`;
  await page.goto("/en/account");
  await page.getByLabel("Account action").selectOption("sign-up");
  await page.getByLabel("Name", { exact: true }).fill("New Customer");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("SyntheticCustomerPassword123!");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("check your inbox");
  await sql`update "user" set email_verified=true where email=${email}`;
  await page.getByLabel("Account action").selectOption("sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("SyntheticCustomerPassword123!");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save profile" }),
  ).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Updated Customer");
  await page.getByLabel("Phone", { exact: true }).fill("+1 555 0100");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved");
  const [customer] =
    await sql`select name,phone from customers where email=${email}`;
  expect(customer.name).toBe("Updated Customer");
  expect(customer.phone).toBe("+1 555 0100");
  await page.screenshot({
    path: test.info().outputPath("cross-service-account.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("Account action")).toBeVisible();
  await page.getByRole("link", { name: "中文", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "购物车", exact: true }),
  ).toBeVisible();
});
