import { createHmac, randomUUID } from "node:crypto";
import { test, expect, clientHeaders } from "./fixtures";

function totp(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret]
    .map((c) => alphabet.indexOf(c).toString(2).padStart(5, "0"))
    .join("");
  const key = Buffer.from(
    bits.match(/.{8}/g)!.map((b) => Number.parseInt(b, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac("sha1", key).update(counter).digest();
  return String(
    (hash.readUInt32BE(hash[19]! & 15) & 0x7fffffff) % 1000000,
  ).padStart(6, "0");
}

test("staff enrolls an authenticator and signs in using a second factor", async ({
  page,
  sql,
}) => {
  const email = `mfa-browser-${randomUUID()}@example.test`;
  const password = "BrowserAuthenticatorPassword123!";
  await page.goto("/admin/login");
  const origin = new URL(page.url()).origin;
  const created = await page.request.post("/api/auth/sign-up/email", {
    headers: { origin },
    data: { email, password, name: "MFA browser fixture" },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const [identity] =
    await sql`update "user" set email_verified=true where email=${email} returning id`;
  await sql`insert into staff_memberships (user_id,email,role,is_active) values (${identity!.id},${email},'owner',true)`;
  try {
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "Sign in securely", exact: true })
      .click();
    await expect(page).toHaveURL(/\/admin$/);
    const response = await page.goto("/admin/security");
    expect(response!.headers()["x-content-type-options"]).toBe("nosniff");
    await page.getByLabel("Current password").fill(password);
    await page.getByRole("button", { name: "Set up authenticator" }).click();
    const secret = await page.locator("code").innerText();
    await page.getByLabel("Authenticator code").fill(totp(secret));
    await page.getByRole("button", { name: "Confirm authenticator" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Authenticator enabled",
    );
    await page
      .getByRole("button", { name: "I saved my recovery codes" })
      .click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/login/);
    await page.setExtraHTTPHeaders(clientHeaders());
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "Sign in securely", exact: true })
      .click();
    await expect(page.getByLabel("Authenticator code")).toBeVisible();
    expect(
      await (await page.request.get("/api/admin-auth/get-session")).json(),
    ).toBeNull();
    await page.getByLabel("Authenticator code").fill(totp(secret));
    await page
      .getByRole("button", { name: "Sign in securely", exact: true })
      .click();
    await expect(page).toHaveURL(/\/admin$/);
    await page.setExtraHTTPHeaders(clientHeaders());
    await page.goto("/admin/security");
    await page.getByLabel("Current password").fill(password);
    await page.getByRole("button", { name: "Disable authenticator" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Authenticator disabled",
    );
  } finally {
    await sql`delete from staff_memberships where user_id=${identity!.id}`;
    await sql`delete from "user" where id=${identity!.id}`;
  }
});
