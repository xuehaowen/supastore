import { test, expect, clickAction } from "./fixtures";

test("merchant publishes policies and optional SMS consent remains independent of checkout", async ({
  admin,
  page,
  sql,
}) => {
  const [original] =
    await sql`select public_content,sms_policy from store_settings`;
  try {
    await admin.goto("/admin/settings/content");
    await admin
      .locator('textarea[name="en.privacy"]')
      .fill(
        "Example store Privacy Policy. Your mobile information will not be sold or shared with third parties for promotional or marketing purposes.",
      );
    await admin
      .locator('textarea[name="en.terms"]')
      .fill(
        "Example store Terms of Service. SMS order updates are optional. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out or HELP for help.",
      );
    await clickAction(
      admin,
      admin.getByRole("button", { name: "Save store content" }),
    );
    await expect(
      admin.getByText("Store content saved.", { exact: true }),
    ).toBeVisible();
    await admin.goto("/admin/settings/sms");
    await admin.locator('input[name="enabled"]').check();
    await clickAction(
      admin,
      admin.getByRole("button", { name: "Save SMS settings" }),
    );
    await expect(admin.getByRole("main").getByRole("alert")).toContainText(
      "Review the policies, SMS disclosures",
    );
    await admin.locator('input[name="reviewed"]').check();
    await admin.locator('input[name="enabled"]').check();
    await clickAction(
      admin,
      admin.getByRole("button", { name: "Save SMS settings" }),
    );
    await expect(
      admin.getByText("SMS settings saved.", { exact: true }),
    ).toBeVisible();
    await page.goto("/sms");
    await expect(page).toHaveURL(/\/en\/sms$/);
    await expect(page.getByRole("checkbox")).not.toBeChecked();
    await expect(
      page.getByLabel("Phone number (including country code)"),
    ).toBeVisible();
    await expect(
      page.getByText(/mobile information will not be sold or shared/),
    ).toBeVisible();
    await expect(
      page.getByText(/SMS enrollment is currently unavailable/),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Terms of Service", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Terms of service", exact: true }),
    ).toBeVisible();
    await page.goto("/privacy");
    await expect(
      page.getByRole("heading", { name: "Privacy policy", exact: true }),
    ).toBeVisible();
    await page.goto("/en/products/studio-cup");
    await page.getByRole("button", { name: "Add to bag" }).click();
    await page.getByRole("link", { name: "Continue to checkout" }).click();
    await page.getByLabel("Street address").fill("123 SMS Test Street");
    await page.getByRole("button", { name: /Review your order/ }).click();
    const sms = page.getByRole("group", {
      name: "SMS order updates (optional)",
    });
    await expect(sms.getByRole("checkbox")).not.toBeChecked();
    await expect(page.locator('input[name="smsPreferenceId"]')).toHaveValue("");
    await page.getByLabel("Your name").fill("SMS optional customer");
    await page.getByLabel("Email address").fill("sms-optional@example.test");
    await page.locator('input[name="accepted"]').check();
    await page
      .getByRole("button", { name: /Accept total & place order/ })
      .click();
    await expect(page).toHaveURL(/\/en\/orders\//);
    const [order] =
      await sql`select sms_preference_id from orders where id=${page.url().split("/").at(-1)!}`;
    expect(order!.sms_preference_id).toBeNull();
  } finally {
    await sql`update store_settings set public_content=${JSON.stringify(original!.public_content)}::jsonb,sms_policy=${JSON.stringify(original!.sms_policy)}::jsonb`;
  }
});
