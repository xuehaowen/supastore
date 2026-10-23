import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures";

test("adding repeatedly keeps product selections and updates the bag count", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/en/products/studio-cup");
  await page
    .getByRole("button", { name: "Increase quantity", exact: true })
    .click();
  for (const count of [2, 4]) {
    await page.getByRole("button", { name: "Add to bag", exact: true }).click();
    await expect(
      page.getByText("Added to your bag", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".storefront-desktop-nav .bag-count")).toHaveText(
      String(count),
    );
    await expect(page.locator('input[name="quantity"]')).toHaveValue("2");
    await expect(page).toHaveURL(/\/en\/products\/studio-cup$/);
  }
  await page.getByRole("link", { name: "View bag", exact: true }).click();
  await expect(page.locator(".cart-item-image").first()).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("mobile menu traps focus, closes on Escape, and restores its trigger", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/en");
  const trigger = page.getByRole("button", { name: "Menu", exact: true });
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  for (let index = 0; index < 10; index++) {
    await page.keyboard.press("Tab");
    await expect
      .poll(() =>
        page.evaluate(
          () => !!document.activeElement?.closest('[role="dialog"]'),
        ),
      )
      .toBe(true);
  }
  expect(
    await page
      .getByRole("dialog")
      .evaluate((element) => getComputedStyle(element).transitionProperty),
  ).toBe("none");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("hero editor persists bilingual content and refuses unknown asset keys", async ({
  admin,
  page,
  sql,
}) => {
  const [original] = await sql`select storefront_hero from store_settings`;
  const origin = process.env.ADMIN_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL!;
  try {
    const rejected = await admin.request.post("/api/v1/admin/settings", {
      headers: { origin },
      data: { storefrontHero: { imageKey: "private/not-a-public-image" } },
    });
    expect(rejected.ok()).toBe(false);
    await admin.goto("/admin/setup");
    const editor = admin.locator("#storefront");
    await editor
      .locator('[name="hero-en-heading"]')
      .fill("Objects for everyday rituals");
    await editor.locator('[name="hero-zh-heading"]').fill("为日常而选");
    await editor
      .getByRole("button", { name: "Save homepage", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await sql`select storefront_hero from store_settings`)[0]!
            .storefront_hero.en.heading,
      )
      .toBe("Objects for everyday rituals");
    await page.goto("/zh");
    await expect(page.locator("main h1")).toHaveText("为日常而选");
    expect(
      (
        await page.request.get(
          "/api/assets?key=private%2Fnot-a-public-image&inline=1",
        )
      ).status(),
    ).toBe(404);
  } finally {
    await sql`update store_settings set storefront_hero=${sql.json(original!.storefront_hero)}`;
  }
});

test("storefront layouts work in both languages at mobile, tablet and desktop widths", async ({
  page,
  sql,
}, info) => {
  test.setTimeout(240000);
  await page.goto("/en/products/studio-cup");
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await expect(
    page.getByText("Added to your bag", { exact: true }),
  ).toBeVisible();
  const [category] = await sql`select slug from categories limit 1`;
  for (const locale of ["en", "zh"]) {
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of [
        "",
        "/search?q=studio",
        "/products/studio-cup",
        "/cart",
        "/checkout",
        "/account",
        `/categories/${category!.slug}`,
        "/pages/about",
        "/search?q=no-such-product",
        "/products/missing-redesign-product",
      ]) {
        await page.goto(`/${locale}${route}`);
        await expect(page.locator("h1").first()).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
        if (
          ["", "/products/studio-cup", "/checkout", "/account"].includes(route)
        ) {
          const audit = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze();
          expect(
            audit.violations.filter((v) =>
              ["serious", "critical"].includes(v.impact ?? ""),
            ),
          ).toEqual([]);
        }
        if (
          locale === "en" &&
          ((route === "" && width === 1440) ||
            (route === "/products/studio-cup" && width === 375) ||
            (route === "/checkout" && width === 375))
        ) {
          const name =
            route === ""
              ? "home-desktop"
              : route.includes("products")
                ? "product-mobile"
                : "checkout-mobile";
          await page.screenshot({
            path: `docs/images/redesign-${name}.png`,
            fullPage: true,
          });
          await info.attach(name, {
            path: `docs/images/redesign-${name}.png`,
            contentType: "image/png",
          });
        }
      }
    }
  }
});
