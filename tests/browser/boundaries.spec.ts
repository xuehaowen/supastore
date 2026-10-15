import AxeBuilder from "@axe-core/playwright";
import {
  test,
  expect,
  checkout,
  openOrder,
  clickAction,
  record,
} from "./fixtures";

async function accessible(page: import("@playwright/test").Page) {
  await page.waitForLoadState("load");
  await expect
    .poll(
      () =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      { timeout: 10000 },
    )
    .toBe(true);
  const scan = await new AxeBuilder({ page }).analyze();
  expect(
    scan.violations.filter((v) =>
      ["critical", "serious"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

test("C3 unsupported destination preserves cart and explains next action", async ({
  page,
  sql,
}) => {
  const zones = await sql`select id,country_codes from shipping_zones`;
  await sql`update shipping_zones set country_codes='["US"]'::jsonb`;
  try {
    await page.goto("/en/products/studio-cup");
    await page.getByRole("button", { name: "Add to bag" }).click();
    await page.getByRole("link", { name: "Continue to checkout" }).click();
    await page.getByLabel("Country", { exact: true }).selectOption("AQ");
    await page.getByLabel("Street address").fill("1 Test Street");
    await page
      .getByLabel("Payment method")
      .selectOption({ label: "Demo bank transfer" });
    await clickAction(
      page,
      page.getByRole("button", { name: /Review your order/ }),
    );
    await expect(page.locator('[data-slot="alert"]')).toContainText(
      /ship|destination|country/i,
    );
    await page.goto("/en/cart");
    await expect(page.getByText("Studio cup", { exact: true })).toBeVisible();
  } finally {
    for (const zone of zones)
      await sql`update shipping_zones set country_codes=${zone.country_codes === null ? null : sql.json(zone.country_codes)} where id=${zone.id}`;
  }
});

test("C3/C4 keyboard checkout and expanded admin forms are accessible on mobile", async ({
  page,
  admin,
  sql,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await admin.setViewportSize({ width: 360, height: 780 });
  await page.goto("/en/products/studio-cup");
  await page.getByRole("button", { name: "Add to bag" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await page.getByLabel("Street address").fill("1 Test Street");
  await page
    .getByLabel("Payment method")
    .selectOption({ label: "Demo bank transfer" });
  await accessible(page);
  await page.getByRole("button", { name: /Review your order/ }).focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("Your name").fill("Keyboard Customer");
  await page.getByLabel("Email address").fill("keyboard@example.test");
  await page.getByRole("checkbox").focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("checkbox")).toBeChecked();
  await accessible(page);
  await page
    .getByRole("button", { name: /Accept total & place order/ })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/orders\//);
  const reference = await page.locator("h1").innerText();
  await openOrder(admin, reference);
  await accessible(admin);
  await record(admin, reference, 2900);
  await admin.goto("/admin/fulfillment?work=all");
  const row = admin
    .locator("#ready details")
    .filter({ has: admin.locator("summary", { hasText: reference }) });
  await row.locator("summary").click();
  await accessible(admin);
  await admin.goto("/admin/setup");
  await accessible(admin);
});

test("A7 late receipt on a cancelled order creates return work without reopening", async ({
  page,
  admin,
  sql,
}) => {
  const order = await checkout(page, sql);
  const row = await openOrder(admin, order.reference_code);
  await row.getByLabel("Cancellation reason").fill("Cancelled before payment");
  await clickAction(
    admin,
    row.getByRole("button", { name: "Cancel order", exact: true }),
  );
  await record(admin, order.reference_code, 100);
  expect(
    (await sql`select lifecycle_status from orders where id=${order.id}`)[0]!
      .lifecycle_status,
  ).toBe("cancelled");
  await admin.goto("/admin/fulfillment?work=all");
  const operations = admin.locator("#ready details").filter({
    has: admin.locator("summary", { hasText: order.reference_code }),
  });
  await operations.locator("summary").click();
  await operations.getByLabel("Surplus return amount (USD)").fill("1.00");
  await operations.getByLabel("Return reason").fill("Late payment return");
  await clickAction(
    admin,
    operations.getByRole("button", {
      name: "Authorize surplus return",
      exact: true,
    }),
  );
  const returns =
    await sql`select amount_cents from payment_returns where order_id=${order.id} and kind='late_return'`;
  expect(returns).toHaveLength(1);
  expect(returns[0]!.amount_cents).toBe(100);
  await page.reload();
  await expect(page.getByText(/cancelled/).first()).toBeVisible();
});

test("Account registration requires verification, retries sign-in, denies admin and signs out", async ({
  page,
  sql,
}) => {
  const email = "account-" + Date.now() + "@example.test";
  await page.goto("/en/account");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("Account Customer");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.DEMO_OWNER_PASSWORD!);
  await page.locator('button[type="submit"]:visible').click();
  await expect(page.locator('[data-slot="alert"]')).toContainText(
    "Check your inbox",
  );
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.DEMO_OWNER_PASSWORD!);
  await page
    .getByRole("button", { name: "Sign in securely", exact: true })
    .click();
  await expect(page.locator('[data-slot="alert"]')).toContainText(
    "Please verify your email",
  );
  const messages: string[] = await (
    await page.request.get("http://127.0.0.1:9010")
  ).json();
  const message = messages.find(
    (message) =>
      message.includes(email) && message.includes("/api/auth/verify-email"),
  )!;
  const verificationUrl = message.match(
    /https?:\/\/[^\s<>"']*\/api\/auth\/verify-email\?[^\s<>"']+/,
  )![0]!;
  await page.goto(verificationUrl);
  await expect(
    page.getByRole("heading", { name: "Good to see you." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/en$/);
  await page.goto("/en/account");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("IncorrectPassword123!");
  await page
    .getByRole("button", { name: "Sign in securely", exact: true })
    .click();
  await expect(page.locator('[data-slot="alert"]')).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in securely", exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.DEMO_OWNER_PASSWORD!);
  await page
    .getByRole("button", { name: "Sign in securely", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Good to see you." }),
  ).toBeVisible();
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.locator('[data-slot="alert"]')).toContainText(
    "does not have staff access",
  );
  await page.goto("/en/account");
  await page.route(
    "**/api/auth/sign-out",
    (route) => route.fulfill({ status: 503, body: "Unavailable" }),
    { times: 1 },
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/en$/);
  await page.goto("/en/account");
  await expect(
    page.getByRole("button", { name: "Sign in securely", exact: true }),
  ).toBeVisible();
});

test("customer profile and emailed password reset persist and reject the old password", async ({
  page,
  sql,
}) => {
  const email = `reset-${Date.now()}@example.test`,
    oldPassword = "SyntheticOldPassword123!",
    newPassword = "SyntheticNewPassword123!";
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers: { origin: process.env.APP_URL! },
    data: { name: "Reset customer", email, password: oldPassword },
  });
  expect(signup.ok()).toBe(true);
  await sql`update "user" set email_verified=true where email=${email}`;
  await page.goto("/en/account");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(oldPassword);
  await page
    .getByRole("button", { name: "Sign in securely", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("Updated reset customer");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await sql`select name from customers where email=${email}`)[0]?.name,
    )
    .toBe("Updated reset customer");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/en$/);
  await page.goto("/en/account");
  await page.getByText("Forgot password?", { exact: true }).click();
  await page.getByLabel("Email for password reset").fill(email);
  await page.getByRole("button", { name: "Send link", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Check your inbox");
  const messages: string[] = await (
    await page.request.get("http://127.0.0.1:9010")
  ).json();
  const message = messages.find(
    (text) => text.includes(email) && text.includes("reset-password"),
  );
  expect(message).toBeTruthy();
  await page.goto(
    message!.match(/https?:\/\/[^\s<>"']*reset-password[^\s<>"']*/)![0]!,
  );
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm password", { exact: true }).fill(newPassword);
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await page.getByRole("link", { name: "Return to sign in" }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(oldPassword);
  await page
    .getByRole("button", { name: "Sign in securely", exact: true })
    .click();
  await expect(page.locator('[data-slot="alert"]')).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill(newPassword);
  await page
    .getByRole("button", { name: "Sign in securely", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Good to see you." }),
  ).toBeVisible();
});
test("M1 store email verification sends a local test link and rejects reuse", async ({
  admin,
  sql,
}) => {
  await admin.goto("/admin/setup");
  await clickAction(
    admin,
    admin.getByRole("button", { name: "Send verification email", exact: true }),
  );
  await expect(
    admin.getByRole("alert").filter({ hasText: "accepted by the mail server" }),
  ).toContainText("accepted by the mail server");
  const messages: string[] = await (
    await admin.request.get("http://127.0.0.1:9010")
  ).json();
  const message = messages
    .filter((message) => message.includes("/admin/setup/verify-email?"))
    .at(-1)!;
  const url = message.match(
    /https?:\/\/[^\s<>"']*\/admin\/setup\/verify-email\?[^\s<>"']+/,
  )![0]!;
  await admin.goto(url);
  await clickAction(
    admin,
    admin.getByRole("button", { name: "Confirm email delivery", exact: true }),
  );
  await expect(
    admin.getByText("Email delivery verified", { exact: true }),
  ).toBeVisible();
  expect(
    (await sql`select email_verified_at from store_settings`)[0]!
      .email_verified_at,
  ).not.toBeNull();
  await admin.goto(url);
  await clickAction(
    admin,
    admin.getByRole("button", { name: "Confirm email delivery", exact: true }),
  );
  await expect(admin.locator('[data-slot="alert"]')).toContainText(
    "expired or already used",
  );
});

test("M2/C1 multiple variants and Chinese product text persist into customer selection", async ({
  page,
  admin,
  sql,
}) => {
  const handle = "variants-" + Date.now();
  await admin.goto("/admin/products");
  await admin.getByRole("button", { name: "Add product", exact: true }).click();
  await admin.getByLabel("Title", { exact: true }).fill("Variant CUJ");
  await admin.getByLabel("URL handle", { exact: true }).fill(handle);
  await admin.getByLabel("SKU", { exact: true }).fill(handle + "-a");
  await admin.getByLabel("Variant name", { exact: true }).fill("Small");
  await admin.getByLabel("Price in minor units", { exact: true }).fill("100");
  await admin.getByRole("button", { name: "Add variant", exact: true }).click();
  const variant = admin.getByRole("group", { name: "Variant 2", exact: true });
  await variant.getByLabel("SKU", { exact: true }).fill(handle + "-b");
  await variant.getByLabel("Variant name", { exact: true }).fill("Large");
  await variant.getByLabel("Price in minor units", { exact: true }).fill("200");
  await clickAction(
    admin,
    admin.getByRole("button", { name: "Publish product", exact: true }),
  );
  await admin.goto("/admin/translations?locale=zh");
  const translationRow = admin.locator(".translation-row").filter({
    hasText: "Variant CUJ",
  });
  await translationRow.getByRole("button", { name: "Add translation" }).click();
  const translation = admin.getByRole("dialog", {
    name: /Chinese translation · Variant CUJ/,
  });
  await translation.getByLabel("Chinese text").fill("测试商品");
  await clickAction(
    admin,
    translation.getByRole("button", { name: "Save translation" }),
  );
  await page.goto("/zh/products/" + handle);
  await expect(
    page.getByRole("heading", { name: "测试商品", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "English", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/en/products/${handle}$`));
  await expect(
    page.getByRole("heading", { name: "Variant CUJ", exact: true }),
  ).toBeVisible();
  const [large] =
    await sql`select id from product_variants where sku=${handle + "-b"}`;
  const largeRadio = page.getByRole("radio", { name: /Large/ });
  await expect(largeRadio).toHaveValue(large!.id);
  await largeRadio.check();
  await expect(largeRadio).toBeChecked();
  await expect
    .poll(() =>
      largeRadio.evaluate((radio: HTMLInputElement) =>
        new FormData(radio.form!).get("variantId"),
      ),
    )
    .toBe(large!.id);
  await clickAction(page, page.getByRole("button", { name: "Add to bag" }));
  await expect(page.getByText("Large", { exact: false }).first()).toBeVisible();
  await expect
    .poll(async () => {
      const selected =
        await sql`select ci.quantity from cart_items ci join product_variants pv on pv.id=ci.variant_id where pv.sku=${handle + "-b"}`;
      return selected[0]?.quantity ?? 0;
    })
    .toBe(1);
  const selected =
    await sql`select ci.quantity,pv.sku from cart_items ci join product_variants pv on pv.id=ci.variant_id where pv.sku=${handle + "-b"}`;
  expect(selected).toHaveLength(1);
  expect(selected[0]!.quantity).toBe(1);
});
