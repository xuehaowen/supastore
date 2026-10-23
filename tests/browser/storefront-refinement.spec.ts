import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";

test("owner previews unsaved bilingual crops and orders published homepage merchandising", async ({
  admin,
  page,
  sql,
}) => {
  const [original] = await sql`select storefront_hero from store_settings`;
  const products =
    await sql`select id,title from products where handle in ('studio-cup','market-tote') order by handle`;
  const [collection] =
    await sql`insert into product_collections(handle,title,description,is_published) values('daily-rituals','Daily rituals','Objects to keep close.',true) returning id`;
  try {
    await admin.goto("/admin/setup");
    const editor = admin.locator("#storefront");
    await editor
      .locator('[name="hero-en-heading"]')
      .fill("Morning, thoughtfully made.");
    await editor.locator('[name="hero-zh-heading"]').fill("用心开启每一天");
    await editor
      .getByLabel("Photograph crop", { exact: true })
      .selectOption("bottom");
    await editor
      .getByRole("button", { name: "Mobile · 375px", exact: true })
      .click();
    const frame = admin.frameLocator(
      'iframe[title="Unsaved homepage preview"]',
    );
    await expect(frame.getByRole("heading", { level: 1 })).toHaveText(
      "Morning, thoughtfully made.",
    );
    await expect(
      admin.locator('iframe[title="Unsaved homepage preview"]'),
    ).toHaveAttribute("width", "375");
    await editor
      .getByLabel("Preview language", { exact: true })
      .selectOption("zh");
    await expect(frame.getByRole("heading", { level: 1 })).toHaveText(
      "用心开启每一天",
    );
    await expect
      .poll(() =>
        frame
          .getByRole("img")
          .evaluate((image) => getComputedStyle(image).objectPosition),
      )
      .toBe("50% 100%");
    expect(
      (await sql`select storefront_hero from store_settings`)[0]!
        .storefront_hero,
    ).toEqual(original!.storefront_hero);
    const draft = await admin.context().newPage();
    try {
      const html = (await admin
        .locator('iframe[title="Unsaved homepage preview"]')
        .getAttribute("srcdoc"))!;
      await draft.route("**/draft-accessibility-preview", (route) =>
        route.fulfill({ contentType: "text/html", body: html }),
      );
      await draft.goto(
        new URL("/draft-accessibility-preview", admin.url()).href,
      );
      const scan = await new AxeBuilder({ page: draft }).analyze();
      expect(
        scan.violations.filter((item) =>
          ["serious", "critical"].includes(item.impact ?? ""),
        ),
      ).toEqual([]);
    } finally {
      await draft.close();
    }
    while (await editor.getByRole("button", { name: /^Remove / }).count())
      await editor
        .getByRole("button", { name: /^Remove / })
        .first()
        .click();
    await editor
      .getByLabel("Add collection", { exact: true })
      .selectOption(collection.id);
    for (const product of products)
      await editor
        .getByLabel("Add product", { exact: true })
        .selectOption(product.id);
    await editor
      .getByRole("button", {
        name: `Move ${products[1]!.title} up`,
        exact: true,
      })
      .click();
    await editor
      .getByRole("region", { name: "Homepage preview", exact: true })
      .scrollIntoViewIfNeeded();
    await admin.setViewportSize({ width: 1280, height: 1600 });
    await editor
      .getByRole("region", { name: "Homepage preview", exact: true })
      .screenshot({
        path: "docs/images/refinement-owner-preview.png",
        style: ".workspace-topbar { visibility: hidden !important; }",
      });
    await admin.setViewportSize({ width: 1280, height: 720 });
    await editor
      .getByRole("button", { name: "Save homepage", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await sql`select storefront_hero from store_settings`)[0]!
            .storefront_hero.featuredProductIds,
      )
      .toEqual([products[1]!.id, products[0]!.id]);
    await page.goto("/en");
    await expect(page.locator(".catalog-hero-image")).toHaveAttribute(
      "data-position",
      "bottom",
    );
    await expect(
      page
        .locator(".catalog-featured-collections")
        .getByRole("link", { name: /Daily rituals/ }),
    ).toBeVisible();
    await expect(
      page.locator(".storefront-product-card h3").first(),
    ).toHaveText(products[1]!.title);
    await page.goto("/en/search?q=studio");
    await expect(page.locator(".catalog-featured-collections")).toHaveCount(0);
    await expect(page.locator(".storefront-product-card h3")).toHaveText([
      "Studio cup",
    ]);
  } finally {
    await sql`update store_settings set storefront_hero=${sql.json(original!.storefront_hero)}`;
    await sql`delete from product_collections where id=${collection.id}`;
  }
});

test("product discovery has hover and touch image navigation with position indicators", async ({
  page,
}) => {
  await page.goto("/en");
  const card = page.locator(".storefront-product-card").filter({
    has: page.getByRole("heading", { name: "Studio cup", exact: true }),
  });
  await card.locator(".storefront-product-image").hover();
  await expect(
    card.getByRole("button", { name: "Photo · Studio cup 2 / 2", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(0, 0);
  await expect(
    card.getByRole("button", { name: "Photo · Studio cup 1 / 2", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await card
    .getByRole("button", { name: "Photo · Studio cup 2 / 2", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    card.getByRole("button", { name: "Photo · Studio cup 2 / 2", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/en/products/studio-cup");
  const total = await page
    .locator(".product-gallery button[aria-pressed]")
    .count();
  await page.getByRole("button", { name: "Next photo", exact: true }).click();
  await expect(page.locator(".product-gallery-controls")).toContainText(
    `Photo 2 / ${total}`,
  );
  const box = (await page.locator(".product-main-image").boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const y = Math.round(box.y + box.height / 2),
    x = Math.round(box.x + box.width * 0.8);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: x - 100, y }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(page.locator(".product-gallery-controls")).toContainText(
    `Photo ${(2 % total) + 1} / ${total}`,
  );
  await cdp.detach();
  await page.goto("/zh/products/studio-cup");
  await expect(
    page.getByRole("button", { name: "下一张图片", exact: true }),
  ).toBeVisible();
});
