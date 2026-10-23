import { randomUUID } from "node:crypto";
import { test, expect, checkout } from "./fixtures";

test("Chinese storefront translates catalog, auth, recovery and document language", async ({
  page,
}) => {
  await page.goto("/zh");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh");
  await expect(page.getByRole("link", { name: "跳到主要内容" })).toBeAttached();
  await expect(page.getByLabel("排序")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "商品分类" }),
  ).toBeVisible();
  await page.goto("/zh/products/studio-cup?campaign=locale");
  await page.getByRole("link", { name: "English", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/products\/studio-cup\?campaign=locale/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.goto("/zh/account");
  await expect(
    page.getByRole("button", { name: "安全登录", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "创建账户", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "查找订单", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/recover\?locale=zh/);
  await expect(page.getByRole("heading", { name: "查找订单" })).toBeVisible();
  await expect(page.getByLabel("付款编号")).toBeVisible();
  await page.goto("/recover/exchange?token=invalid&locale=zh");
  await expect(page.getByRole("heading", { name: "打开订单" })).toBeVisible();
  await page.getByRole("button", { name: "继续查看订单" }).click();
  await expect(page).toHaveURL(/locale=zh.*error=/);
  await expect(page.locator('[data-slot="alert"]')).not.toContainText(
    /Invalid|Unable|Unauthorized/i,
  );
});

test("Chinese private order translates payment copy, upload errors and statuses", async ({
  page,
  sql,
}) => {
  const order = await checkout(page, sql);
  await page.goto(`/zh/orders/${order.id}`);
  await expect(page.locator("html")).toHaveAttribute("lang", "zh");
  await expect(
    page.getByText("待付款 · 待履约", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "付款凭证" })).toBeVisible();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "复制订单编号", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "已复制", exact: true }),
  ).toBeVisible();
  await page.route("**/api/evidence", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: { message: "An unknown provider error in English" },
      }),
    }),
  );
  await page.locator('input[type="file"]').setInputFiles({
    name: "payment.png",
    mimeType: "image/png",
    buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  });
  await page.getByRole("button", { name: "上传付款凭证", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("无法完成操作");
  await expect(page.getByRole("status")).not.toContainText("provider");
});

test("Chinese verified account has translated profile and address fields", async ({
  page,
  sql,
}) => {
  const id = randomUUID(),
    email = `${id}@example.test`;
  const { hashPassword } = await import("better-auth/crypto");
  const password = await hashPassword(process.env.DEMO_OWNER_PASSWORD!);
  await sql`insert into "user"(id,name,email,email_verified) values(${id},'I18n customer',${email},true)`;
  await sql`insert into account(id,account_id,provider_id,user_id,password) values(${randomUUID()},${id},'credential',${id},${password})`;
  await page.goto("/zh/account");
  await page.getByLabel("电子邮箱", { exact: true }).first().fill(email);
  await page
    .getByLabel("密码", { exact: true })
    .fill(process.env.DEMO_OWNER_PASSWORD!);
  await page.getByRole("button", { name: "安全登录", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "保存个人资料", exact: true }),
  ).toBeVisible();
  await page.getByText("添加地址", { exact: true }).click();
  await expect(page.getByLabel("收件人姓名", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "保存地址", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "退出登录", exact: true }),
  ).toBeVisible();
});

test("Chinese missing pages and request failures have translated fallbacks", async ({
  page,
}) => {
  await page.goto("/zh/products/does-not-exist");
  await expect(page.getByRole("heading", { name: "找不到页面" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh");
  await page.goto("/zh/products/studio-cup");
  await page.getByRole("button", { name: "加入购物袋" }).click();
  await page.getByRole("link", { name: "查看购物袋", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /减少 .* 的数量/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "前往结账" }).click();
  await page.getByLabel("街道地址").fill("1 Customer Street");
  await page.getByLabel("州 / 省").selectOption("CA");
  await expect(page.getByLabel("州 / 省").locator("option:checked")).toHaveText(
    "加利福尼亚州",
  );
  await page.getByLabel("优惠码").fill("INVALID-PROMOTION");
  await page.getByRole("button", { name: /确认订单/ }).click();
  await expect(page.locator('[data-slot="alert"]')).toContainText(
    "此优惠码不可用",
  );
  await page.getByLabel("优惠码").fill("");
  await page.getByRole("radio", { name: "到店自取", exact: true }).check();
  await page
    .locator("button.pickup-calendar-day-btn:not([disabled])")
    .first()
    .click();
  await page.getByLabel("自提时段").selectOption({ index: 1 });
  await page.getByRole("button", { name: /确认订单/ }).click();
  await page.waitForURL(/quote=/);
  await expect(page.getByText(/\d{4}年\d+月\d+日/)).toBeVisible();
});
