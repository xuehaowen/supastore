import { test, expect, login } from "./fixtures";
import { randomUUID } from "node:crypto";

test("staff and customer logins and logouts remain independent in one browser", async ({
  page,
  sql,
}) => {
  await login(page);
  const authHeaders = { origin: new URL(page.url()).origin };
  const staff = await (
    await page.request.get("/api/admin-auth/get-session")
  ).json();
  expect(staff.user.email).toBe("owner@example.test");
  expect(
    await (await page.request.get("/api/auth/get-session")).json(),
  ).toBeNull();
  await page.goto("/en/account");
  await expect(
    page.getByRole("button", { name: "Sign in securely", exact: true }),
  ).toBeVisible();
  const email = `session-${randomUUID()}@example.test`;
  const password = "SessionIsolationPassword123!";
  const created = await page.request.post("/api/auth/sign-up/email", {
    headers: authHeaders,
    data: { email, password, name: "Separate customer" },
  });
  expect(created.ok(), await created.text()).toBe(true);
  await sql`update "user" set email_verified=true where email=${email}`;
  expect(
    (
      await page.request.post("/api/auth/sign-in/email", {
        headers: authHeaders,
        data: { email, password },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (await (await page.request.get("/api/auth/get-session")).json()).user.email,
  ).toBe(email);
  expect(
    (await (await page.request.get("/api/admin-auth/get-session")).json()).user
      .email,
  ).toBe("owner@example.test");
  expect(
    (
      await page.request.post("/api/auth/sign-out", {
        data: {},
        headers: authHeaders,
      })
    ).ok(),
  ).toBe(true);
  expect(
    await (await page.request.get("/api/auth/get-session")).json(),
  ).toBeNull();
  expect(
    (await (await page.request.get("/api/admin-auth/get-session")).json()).user
      .email,
  ).toBe("owner@example.test");
  expect(
    (
      await page.request.post("/api/auth/sign-in/email", {
        headers: authHeaders,
        data: { email, password },
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/admin");
  let failed = false;
  await page.route("**/api/admin-auth/sign-out", async (route) => {
    if (!failed) {
      failed = true;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: "{}",
      });
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Unable to sign out" }),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/api/admin-auth/get-session")).json()).user
      .email,
  ).toBe("owner@example.test");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
  expect(
    await (await page.request.get("/api/admin-auth/get-session")).json(),
  ).toBeNull();
  expect(
    (await (await page.request.get("/api/auth/get-session")).json()).user.email,
  ).toBe(email);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
});
