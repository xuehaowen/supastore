import { test, expect } from "./fixtures";

test("owner previews drafts, rejects invalid publishing, publishes and rolls back notification copy", async ({
  admin,
  sql,
}) => {
  await admin.goto("/admin/settings/notifications");
  await expect(
    admin.getByRole("heading", { name: "Notification templates", exact: true }),
  ).toBeVisible();
  await expect(
    admin.getByText("All required templates are published.", { exact: true }),
  ).toBeVisible();
  const [template] =
    await sql`select id from notification_templates where event='auth.reset_password' and channel='email' and audience='customer' and locale='en'`;
  await admin.goto(`/admin/settings/notifications/${template.id}`);
  await admin
    .getByLabel("Email subject", { exact: true })
    .fill("Preview reset · {{store.name}}");
  await admin
    .getByLabel("Message body", { exact: true })
    .fill("Use this secure link: {{action.url}}");
  await expect(
    admin.getByRole("heading", {
      name: "Preview reset · Example Store",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    admin.getByRole("button", { name: "Publish saved draft", exact: true }),
  ).toBeDisabled();
  await admin.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(admin.getByText("Draft saved.", { exact: true })).toBeVisible();
  const [before] =
    await sql`select published_version from notification_templates where id=${template.id}`;
  expect(before.published_version).toBe(1);
  await admin
    .getByRole("button", { name: "Publish saved draft", exact: true })
    .click();
  await expect(
    admin.getByText("Template published.", { exact: true }),
  ).toBeVisible();
  const [published] =
    await sql`select published_version from notification_templates where id=${template.id}`;
  expect(published.published_version).toBe(2);
  await admin.getByLabel("Message body", { exact: true }).fill("{{secret}}");
  await admin.getByRole("button", { name: "Save draft", exact: true }).click();
  await admin
    .getByRole("button", { name: "Publish saved draft", exact: true })
    .click();
  await expect(
    admin
      .getByRole("alert")
      .filter({ hasText: /simple variables|unsupported variable/ }),
  ).toContainText(/simple variables|unsupported variable/);
  await admin.getByText("Version 1", { exact: true }).click();
  await admin
    .getByRole("button", { name: "Restore version 1", exact: true })
    .click();
  await expect(
    admin.getByText("Published version restored.", { exact: true }),
  ).toBeVisible();
  const [restored] =
    await sql`select published_version from notification_templates where id=${template.id}`;
  expect(restored.published_version).toBe(1);
  await admin.screenshot({
    path: test.info().outputPath("notification-template-editor.png"),
    fullPage: true,
  });
});

test("template completeness lists missing locales and allows owner repair", async ({
  admin,
  sql,
}) => {
  const [template] =
    await sql`select id from notification_templates where event='return.received' and channel='email' and audience='customer' and locale='zh'`;
  await sql`update notification_templates set published_version=NULL where id=${template.id}`;
  try {
    await admin.goto("/admin/settings/notifications");
    await expect(
      admin
        .getByRole("alert")
        .filter({ hasText: "Missing published templates" }),
    ).toContainText("Missing published templates");
    await admin.goto(`/admin/settings/notifications/${template.id}`);
    await admin
      .getByRole("button", { name: "Publish saved draft", exact: true })
      .click();
    await expect(
      admin.getByText("Template published.", { exact: true }),
    ).toBeVisible();
    await admin.goto("/admin/settings/notifications");
    await expect(
      admin.getByText("All required templates are published.", { exact: true }),
    ).toBeVisible();
  } finally {
    await sql`update notification_templates set published_version=1 where id=${template.id}`;
  }
});
