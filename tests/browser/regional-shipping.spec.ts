import { test, expect, clickAction } from "./fixtures";

test("admin regional rates reach checkout and survive validation and editing", async ({
  page,
  admin,
  sql,
}) => {
  const ids: string[] = [];
  async function addZone(
    name: string,
    regions: string,
    prefixes: string,
    rate: string,
  ) {
    await admin.goto("/admin/setup");
    await admin
      .getByRole("button", { name: "Add shipping zone", exact: true })
      .click();
    const form = admin
      .getByRole("dialog", { name: "Add shipping zone", exact: true })
      .locator("form");
    await form.getByLabel("Zone name", { exact: true }).fill(name);
    await form
      .getByLabel("Country codes, comma separated; blank for all")
      .fill("US");
    await form
      .getByLabel("State/region codes, comma separated; blank for all")
      .fill(regions);
    await form
      .getByLabel("ZIP/postal prefixes, comma separated; blank for all")
      .fill(prefixes);
    await form.getByLabel("Flat rate (minor units)").fill(rate);
    await clickAction(
      admin,
      form.getByRole("button", { name: "Save shipping zone", exact: true }),
    );
    await expect(admin).toHaveURL(/\/admin\/setup$/);
    const [zone] = await sql`select id from shipping_zones where name=${name}`;
    ids.push(zone!.id);
  }
  try {
    await addZone("CUJ West Coast", "CA, OR, WA", "", "800");
    await addZone("CUJ East Coast", "NY, MA", "", "1500");
    await addZone("CUJ San Francisco", "CA", "941", "500");
    await page.goto("/en/products/studio-cup");
    await page.getByRole("button", { name: "Add to bag" }).click();
    await page.getByRole("link", { name: "View bag", exact: true }).click();
    await page.getByRole("link", { name: "Continue to checkout" }).click();
    await expect(page.getByLabel("Country", { exact: true })).toHaveValue("US");
    await expect(
      page.getByLabel("Country", { exact: true }).locator("option:checked"),
    ).toHaveText("United States");
    await page.getByLabel("Street address").fill("1 Market Street");
    await page.getByLabel("State / region").selectOption("CA");
    await page.getByLabel("ZIP / postal code").fill("94105");
    await page.getByLabel("Promotion code").fill("INVALID-PROMOTION");
    await page.getByRole("button", { name: /Review your order/ }).click();
    await expect(page.locator('[data-slot="alert"]')).toBeVisible();
    await expect(page.getByLabel("State / region")).toHaveValue("CA");
    await expect(page.getByLabel("ZIP / postal code")).toHaveValue("94105");
    await page.getByLabel("Promotion code").fill("");
    async function review(rate: number) {
      const previousQuote = new URL(page.url()).searchParams.get("quote");
      await page.getByRole("button", { name: /Review your order/ }).click();
      await page.waitForURL(
        (url) =>
          Boolean(url.searchParams.get("quote")) &&
          url.searchParams.get("quote") !== previousQuote &&
          !url.searchParams.has("edit"),
      );
      await expect(
        page.getByRole("link", { name: "Edit fulfillment" }),
      ).toBeVisible();
      const quoteId = new URL(page.url()).searchParams.get("quote");
      const [quote] =
        await sql`select shipping_cents, terms_snapshot from quotes where id=${quoteId}`;
      expect(quote!.shipping_cents).toBe(rate);
      return quote!.terms_snapshot;
    }
    const terms = await review(500);
    expect(terms.shippingAddress).toMatchObject({
      region: "CA",
      postalCode: "94105",
      country: "US",
    });
    await page.getByRole("link", { name: "Edit fulfillment" }).click();
    await expect(page.getByLabel("State / region")).toHaveValue("CA");
    await expect(page.getByLabel("ZIP / postal code")).toHaveValue("94105");
    await page.getByLabel("ZIP / postal code").fill("90001");
    await review(800);
    await page.getByRole("link", { name: "Edit fulfillment" }).click();
    await page.getByLabel("State / region").selectOption("NY");
    await page.getByLabel("ZIP / postal code").fill("10001");
    await review(1500);
  } finally {
    for (const id of ids) await sql`delete from shipping_zones where id=${id}`;
    await sql`update store_settings set quote_version=quote_version+1`;
  }
});
