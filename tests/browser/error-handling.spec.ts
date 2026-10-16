import { test, expect } from "./fixtures";

test("customer redirect errors display a safe diagnostic reference", async ({
  page,
}) => {
  const requestId = "11111111-1111-4111-8111-111111111111";
  await page.goto(`/zh/cart?error=Unable%20to%20save.&requestId=${requestId}`);
  await expect(page.getByRole("alert")).toContainText(requestId);
  await expect(page.getByRole("alert")).toContainText("参考编号");
  await page.goto(
    "/en/cart?error=Unable%20to%20save.&requestId=untrusted-reference",
  );
  await expect(page.getByRole("alert")).not.toContainText(
    "untrusted-reference",
  );
});
