import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import {
  test,
  expect,
  checkout,
  clickAction,
  clientHeaders,
  login,
} from "./fixtures";
import { backendPageRoutes, storefrontPageRoutes } from "./ui-route-manifest";

test("every page source has a usable responsive and accessible screen", async ({
  admin,
  page,
  sql,
  browser,
}, info) => {
  test.setTimeout(360_000);
  const run = randomUUID();
  const order = await checkout(page, sql);
  const [product] =
    await sql`select id,handle from products where handle='studio-cup'`;
  const [variant] =
    await sql`select id from product_variants where product_id=${product!.id} limit 1`;
  const [category] = await sql`select slug from categories limit 1`;
  const [customer] =
    await sql`insert into customers(name,email) values('Page audit customer',${run + "@example.test"}) returning id`;
  const [credit] =
    await sql`insert into store_credit_accounts(customer_id,currency,precision) values(${customer!.id},'USD',2) returning id`;
  const [attribute] =
    await sql`insert into attributes(code,name) values(${run},'Page audit attribute') returning id`;
  const [collection] =
    await sql`insert into product_collections(handle,title,is_published) values(${run},'Page audit collection',true) returning id`;
  const [notification] =
    await sql`select id from notification_templates limit 1`;
  const [goodsReturn] =
    await sql`insert into order_returns(order_id,reason,request_key) values(${order.id},'Page audit return',${run}) returning id`;
  const [store] =
    await sql`select public_content,sms_policy from store_settings`;
  const policies = Object.fromEntries(
    ["en", "zh"].map((locale) => [
      locale,
      Object.fromEntries(
        ["about", "shipping", "returns", "privacy", "terms"].map((key) => [
          key,
          locale === "zh" ? "商店政策说明。" : "Store policy information.",
        ]),
      ),
    ]),
  );
  await sql`update store_settings set public_content=${JSON.stringify(policies)}::jsonb,sms_policy='{"enabled":true,"reviewed":true}'`;
  const records: {
    screen: string;
    url: string;
    heading: string;
    widths: number[];
    accessibility: string;
  }[] = [];
  const accessibilityIssues: { screen: string; violations: unknown[] }[] = [];
  const missingHeadings =
    /This record is unavailable|Page not found|找不到页面/;

  async function inspect(target: Page, screen: string, unavailable = false) {
    const heading = target.getByRole("heading", { level: 1 });
    await expect(heading).toHaveCount(1);
    await expect(heading).toBeVisible();
    await expect(heading).not.toContainText(
      /This page could not be loaded|Store temporarily unavailable|商店暂时无法访问/,
    );
    if (!unavailable) await expect(heading).not.toContainText(missingHeadings);
    await expect(target.getByRole("main")).toHaveCount(1);
    for (const width of [1440, 768, 375]) {
      await target.setViewportSize({ width, height: 1000 });
      await expect
        .poll(
          () =>
            target.evaluate(
              () => document.documentElement.scrollWidth - innerWidth,
            ),
          { message: screen + " horizontal overflow at " + width },
        )
        .toBeLessThanOrEqual(1);
      await expect(heading).toBeVisible();
      if (
        width === 375 &&
        (await target.locator(".storefront-shell > header").count())
      ) {
        const brand = await target
          .locator(".storefront-header .storefront-wordmark")
          .boundingBox();
        const actions = await target
          .locator(
            ".storefront-header .storefront-mobile-actions:visible, .storefront-header .checkout-back:visible",
          )
          .boundingBox();
        expect(brand, screen + " mobile brand").not.toBeNull();
        expect(actions, screen + " mobile actions").not.toBeNull();
        expect(
          brand!.x + brand!.width,
          screen + " mobile header overlap",
        ).toBeLessThanOrEqual(actions!.x);
        expect(
          actions!.x + actions!.width,
          screen + " mobile actions fit",
        ).toBeLessThanOrEqual(width);
      }
    }
    const preview = target.locator('iframe[title="Email layout preview"]');
    const scanner = new AxeBuilder({ page: target });
    // Keep the draft sandbox intact; its document has a separate accessibility audit.
    scanner.exclude('iframe[title="Unsaved homepage preview"]');
    if (await preview.count()) {
      await expect(preview).toHaveAttribute("sandbox", "");
      // axe's asynchronous frame scan cannot complete when the sandbox disables scripts.
      // Audit that HTML separately with CSP, preserving the application's sandbox.
      scanner.exclude('iframe[title="Email layout preview"]');
      const html = await preview.getAttribute("srcdoc");
      expect(html).toBeTruthy();
      const context = await browser.newContext();
      const previewUrl = "https://email-preview.example.test/";
      try {
        await context.route("**/*", (route) =>
          route.request().url() === previewUrl
            ? route.fulfill({
                contentType: "text/html",
                headers: {
                  "Content-Security-Policy":
                    "default-src 'none'; style-src 'unsafe-inline'",
                },
                body: html!,
              })
            : route.abort(),
        );
        const email = await context.newPage();
        await email.goto(previewUrl);
        const result = await new AxeBuilder({ page: email }).analyze();
        const violations = result.violations.filter((item) =>
          ["critical", "serious"].includes(item.impact ?? ""),
        );
        if (violations.length)
          accessibilityIssues.push({
            screen: screen + " email preview",
            violations,
          });
      } finally {
        await context.close();
      }
    }
    const scan = await scanner.analyze();
    const violations = scan.violations.filter((item) =>
      ["critical", "serious"].includes(item.impact ?? ""),
    );
    if (violations.length) accessibilityIssues.push({ screen, violations });
    const name = screen.replace(/[^a-z0-9-]/gi, "-");
    await target.screenshot({
      path: info.outputPath(name + "-mobile.png"),
      fullPage: true,
    });
    records.push({
      screen,
      url: target.url(),
      heading: (await heading.textContent()) ?? "",
      widths: [1440, 768, 375],
      accessibility: violations.length
        ? `${violations.length} serious or critical axe violations`
        : "No serious or critical axe violations",
    });
    await writeFile(
      info.outputPath("page-coverage.partial.json"),
      JSON.stringify({ screens: records, accessibilityIssues }, null, 2),
    );
  }

  try {
    const ids: Record<string, string> = {
      "/admin/attributes": attribute!.id,
      "/admin/collections": collection!.id,
      "/admin/customers": customer!.id,
      "/admin/inventory": variant!.id,
      "/admin/orders": order.id,
      "/admin/products": product!.id,
      "/admin/returns": goodsReturn!.id,
      "/admin/store-credit": credit!.id,
      "/admin/settings/notifications": notification!.id,
    };
    for (const route of backendPageRoutes) {
      if (route === "/" || route === "/admin/login") continue;
      const prefix = route.split("/[id]")[0]!;
      const path = route.replace("[id]", ids[prefix] ?? "");
      const response = await admin.goto(path);
      expect(response?.status(), route).toBeLessThan(400);
      await inspect(admin, "backend " + route);
    }
    await admin.goto(`/admin/inventory/${variant!.id}`);
    await expect(
      admin.getByText("No order reservations for this variant."),
    ).toBeVisible();
    await admin.goto("/admin/settings/notifications?event=missing-event");
    await expect(
      admin.getByText("No templates match this event.", { exact: false }),
    ).toBeVisible();
    await inspect(admin, "backend notifications empty filter");
    await admin.goto(
      "/admin/translations?productsPage=10000&categoriesPage=10000&variantsPage=10000",
    );
    await expect(admin.locator(".admin-empty")).toHaveCount(3);
    await inspect(admin, "backend translations empty pages");

    const root = await admin.request.get("http://localhost:3102/", {
      maxRedirects: 0,
    });
    expect(root.status()).toBe(307);
    expect(
      new URL(root.headers().location!, "http://localhost:3102").pathname,
    ).toBe("/admin");
    const anonymous = await browser.newContext({
      baseURL: process.env.APP_URL!,
      extraHTTPHeaders: clientHeaders(),
    });
    try {
      const login = await anonymous.newPage();
      await login.goto("/admin/login?error=staff");
      await inspect(login, "backend login with access notice");
    } finally {
      await anonymous.close();
    }
    await sql`update store_settings set is_bootstrap_completed=false`;
    try {
      await admin.goto("/admin/setup");
      await expect(
        admin.getByRole("heading", { name: "Create your store" }),
      ).toBeVisible();
      await inspect(admin, "backend setup bootstrap");
    } finally {
      await sql`update store_settings set is_bootstrap_completed=true`;
    }

    for (const route of storefrontPageRoutes) {
      const locales = route.includes("[locale]") ? ["en", "zh"] : ["en"];
      for (const locale of locales) {
        const slugs = route.includes("/pages/")
          ? ["about", "shipping", "returns", "privacy", "terms"]
          : [category!.slug];
        for (const slug of slugs) {
          const path = route
            .replace("[locale]", locale)
            .replace("[id]", order.id)
            .replace("[slug]", slug)
            .replace(
              "[handle]",
              route.includes("/collections/") ? run : product!.handle,
            );
          const response = await page.goto(path);
          expect(response?.status(), path).toBeLessThan(400);
          await inspect(page, "storefront " + path);
        }
      }
    }
    // Cover the actual checkout form as well as its empty-cart state.
    await page.goto("/en/products/studio-cup");
    await page.getByRole("button", { name: "Add to bag", exact: true }).click();
    await page.getByRole("link", { name: "View bag", exact: true }).click();
    for (const locale of ["en", "zh"]) {
      await page.goto(`/${locale}/checkout`);
      await inspect(page, "storefront " + locale + " populated checkout");
    }

    const userId = randomUUID();
    const email = run + "@example.test";
    const { hashPassword } = await import("better-auth/crypto");
    const password = await hashPassword(process.env.DEMO_OWNER_PASSWORD!);
    await sql`insert into "user"(id,name,email,email_verified) values(${userId},'Page audit customer',${email},true)`;
    await sql`insert into account(id,account_id,provider_id,user_id,password) values(${randomUUID()},${userId},'credential',${userId},${password})`;
    await sql`update customers set auth_user_id=${userId} where id=${customer!.id}`;
    await sql`update orders set customer_id=${customer!.id} where id=${order.id}`;
    const signedIn = await page.request.post("/api/auth/sign-in/email", {
      headers: { origin: process.env.APP_URL! },
      data: { email, password: process.env.DEMO_OWNER_PASSWORD! },
    });
    expect(signedIn.ok()).toBe(true);
    for (const locale of ["en", "zh"]) {
      await page.goto(`/${locale}/account`);
      await expect(
        page.getByRole("button", {
          name: locale === "zh" ? "保存个人资料" : "Save profile",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByText(order.reference_code, { exact: false }),
      ).toBeVisible();
      await expect(
        page.getByText(
          locale === "zh" ? "暂无余额变动记录。" : "No credit activity yet.",
        ),
      ).toBeVisible();
      await inspect(page, "storefront " + locale + " signed-in account");
      await page
        .getByText(locale === "zh" ? "添加地址" : "Add address", {
          exact: true,
        })
        .click();
      await inspect(page, "storefront " + locale + " address editor");
      await page.goto(`/${locale}/products/not-a-real-product`);
      await inspect(page, "storefront " + locale + " not found", true);
      await page.goto(`/${locale}/search?q=${run}`);
      await inspect(page, "storefront " + locale + " empty search");
    }
    await admin.goto(`/admin/products/${randomUUID()}/edit`);
    await inspect(admin, "backend missing record", true);
    await sql`insert into staff_memberships(user_id,email,role) values(${userId},${email},'staff')`;
    const staffContext = await browser.newContext({
      baseURL: process.env.APP_URL!,
      extraHTTPHeaders: clientHeaders(),
    });
    try {
      const staffPage = await staffContext.newPage();
      await login(staffPage, email);
      for (const path of [
        "/admin",
        "/admin/orders",
        "/admin/payments",
        "/admin/fulfillment",
        "/admin/fulfillment/shipments",
        "/admin/inventory/slots",
        "/admin/products",
        "/admin/products/import",
        "/admin/inventory",
        "/admin/inventory/pending",
        "/admin/customers",
        "/admin/store-credit",
        "/admin/returns",
        "/admin/reports",
        `/admin/products/${product!.id}/specifications`,
        `/admin/orders/${order.id}`,
        `/admin/inventory/${variant!.id}`,
        `/admin/customers/${customer!.id}`,
        `/admin/store-credit/${credit!.id}`,
      ]) {
        await staffPage.goto(path);
        await expect(
          staffPage
            .getByRole("navigation", { name: "Admin", exact: true })
            .getByRole("link", { name: "Settings", exact: true }),
        ).toHaveCount(0);
        await expect(
          staffPage.locator(
            'a[href="/admin/reconciliation"], a[href="/admin/products/new"], a[href="/admin/products/mapping"], a[href$="/edit"]',
          ),
        ).toHaveCount(0);
        if (path === "/admin/products") {
          await expect(
            staffPage.getByRole("button", { name: "Add product", exact: true }),
          ).toHaveCount(0);
          await expect(
            staffPage
              .getByRole("link", { name: "View specifications", exact: true })
              .first(),
          ).toBeVisible();
        }
        if (path === "/admin/products/import") {
          await expect(
            staffPage.getByRole("heading", {
              name: "Import products",
              exact: true,
            }),
          ).toHaveCount(0);
          await expect(
            staffPage.getByText("Only owners can import or change products.", {
              exact: false,
            }),
          ).toBeVisible();
        }
        await inspect(staffPage, "staff " + path);
      }
    } finally {
      await staffContext.close();
    }
    const coverageReport = JSON.stringify(
      {
        backendSources: backendPageRoutes.length,
        storefrontSources: storefrontPageRoutes.length,
        backendRootRedirect: "verified",
        screens: records,
        accessibilityIssues,
      },
      null,
      2,
    );
    const coveragePath = info.outputPath("page-coverage.json");
    await writeFile(coveragePath, coverageReport);
    await info.attach("page-coverage", {
      path: coveragePath,
      contentType: "application/json",
    });
    expect(accessibilityIssues).toEqual([]);
  } finally {
    await sql`update store_settings set public_content=${JSON.stringify(store!.public_content)}::jsonb,sms_policy=${JSON.stringify(store!.sms_policy)}::jsonb,is_bootstrap_completed=true`;
  }
});

test("report and commerce settings accept decimal currency amounts", async ({
  admin,
  sql,
}) => {
  const reason = "UI decimal entry " + randomUUID();
  await admin.goto("/admin/reports");
  await admin.getByLabel("Net sales (USD)", { exact: true }).fill("-12.34");
  await admin.getByLabel("Tax (USD)", { exact: true }).fill("-0.56");
  await admin.getByLabel("Reason", { exact: true }).fill(reason);
  await clickAction(
    admin,
    admin.getByRole("button", { name: "Record adjustment", exact: true }),
  );
  await expect(
    admin.getByRole("alert").filter({ hasText: "Adjustment recorded" }),
  ).toBeVisible();
  expect(
    (
      await sql`select net_cents,tax_cents from outside_sales_adjustments where reason=${reason}`
    )[0],
  ).toMatchObject({ net_cents: -1234, tax_cents: -56 });
  await admin.setViewportSize({ width: 375, height: 900 });
  const reportTable = admin.locator('[data-slot="table-container"]');
  await expect(reportTable).toHaveAttribute("tabindex", "0");
  await reportTable.focus();
  await admin.keyboard.press("ArrowRight");
  await expect
    .poll(() => reportTable.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  await admin.goto("/admin/settings/commerce");
  const threshold = admin.getByLabel("Sales warning threshold (USD)", {
    exact: true,
  });
  await threshold.fill("123.45");
  await clickAction(
    admin,
    admin.getByRole("button", { name: "Save policies", exact: true }),
  );
  expect(
    (await sql`select commerce_policy from store_settings`)[0]!.commerce_policy
      .salesThresholdCents,
  ).toBe(12345);
  await threshold.fill("");
  await clickAction(
    admin,
    admin.getByRole("button", { name: "Save policies", exact: true }),
  );
  expect(
    (await sql`select commerce_policy from store_settings`)[0]!.commerce_policy
      .salesThresholdCents,
  ).toBeNull();
});
