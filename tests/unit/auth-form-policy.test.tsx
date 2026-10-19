import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthForm as CustomerAuthForm } from "../../apps/storefront/app/interactive";
import { AuthForm as StaffAuthForm } from "@/app/interactive";
import { CustomerAuthTools } from "../../apps/storefront/app/customer-auth";
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "@supastore/contracts";

vi.mock("../../apps/storefront/app/customer-actions", () => ({
  saveProfileAction: vi.fn(),
}));

it("allows existing credentials below the creation minimum in customer and staff login forms", () => {
  for (const form of [
    <CustomerAuthForm audience="customer" />,
    <StaffAuthForm />,
  ]) {
    const html = renderToStaticMarkup(form);
    expect(html).toContain('type="password"');
    expect(html).not.toMatch(/minLength=/i);
    expect(html).not.toMatch(/maxLength=/i);
  }
});

it("applies the shared creation limits when entering a new password", () => {
  const html = renderToStaticMarkup(
    <CustomerAuthTools locale="en" reset token="synthetic" />,
  );
  expect(html).toContain(`minLength="${MIN_PASSWORD_LENGTH}"`);
  expect(html).toContain(`maxLength="${MAX_PASSWORD_LENGTH}"`);
});
