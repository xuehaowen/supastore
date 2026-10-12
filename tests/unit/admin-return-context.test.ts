import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(path);
  },
}));
import { adminReturnPath, perform } from "@/app/actions/common";
import { DomainError } from "@/application/common/errors";

const form = (returnTo: string) => {
  const data = new FormData();
  data.set("returnTo", returnTo);
  return data;
};
it("preserves allowed queue filters, pages and selected management context", () => {
  const path =
    "/admin/orders?q=Buyer&page=2&status=unpaid&manage=11111111-1111-4111-8111-111111111111";
  expect(adminReturnPath(form(path))).toBe(path);
});
it.each([
  "https://evil.test/admin/orders",
  "//evil.test/admin/orders",
  "/admin/../recover",
  "/admin/orders\\bad",
])("rejects foreign or unrelated return paths", (path) => {
  expect(adminReturnPath(form(path))).toBe("/admin");
});
it("strips stale notices and unknown parameters", () => {
  expect(
    adminReturnPath(
      form(
        "/admin/payments?paymentPage=3&paymentQ=Buyer&error=old&created=old&next=https://evil.test",
      ),
    ),
  ).toBe("/admin/payments?paymentPage=3&paymentQ=Buyer");
});
it("places errors before fragments while preserving queue context", async () => {
  await expect(
    perform(
      "/admin/orders?page=2#order-11111111-1111-4111-8111-111111111111",
      async () => {
        throw new DomainError("Invalid input");
      },
    ),
  ).rejects.toThrow(
    "/admin/orders?page=2&error=Invalid%20input#order-11111111-1111-4111-8111-111111111111",
  );
});
