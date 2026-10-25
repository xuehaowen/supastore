import { describe, expect, it } from "vitest";
import { customerValidationMessage } from "../../apps/storefront/lib/customer-validation";
import { checkoutFieldErrors } from "../../apps/storefront/lib/checkout-field-errors";

const valid = {
  valid: true,
  valueMissing: false,
  typeMismatch: false,
  tooShort: false,
  tooLong: false,
  rangeUnderflow: false,
  rangeOverflow: false,
  stepMismatch: false,
  badInput: false,
  patternMismatch: false,
  customError: false,
};
describe("customer form guidance", () => {
  it("links recognized server validation to its field and keeps unrelated failures in the summary", () => {
    expect(checkoutFieldErrors("toString", "en")).toBeUndefined();
    expect(
      checkoutFieldErrors("This promotion code is not active.", "en"),
    ).toHaveProperty("promotionCode");
    expect(
      checkoutFieldErrors("Enter your ZIP or postal code.", "zh"),
    ).toHaveProperty("postalCode");
    expect(
      checkoutFieldErrors("Unknown internal failure", "en"),
    ).toBeUndefined();
  });
  it("does not flag valid fields", () =>
    expect(customerValidationMessage(valid, "en", "text")).toBe(""));
  it("explains missing fields and email formats in the selected language", () => {
    expect(
      customerValidationMessage(
        { ...valid, valid: false, valueMissing: true },
        "en",
        "text",
      ),
    ).toBe("Complete this field.");
    expect(
      customerValidationMessage(
        { ...valid, valid: false, typeMismatch: true },
        "en",
        "email",
      ),
    ).toBe("Enter a valid email address.");
    expect(
      customerValidationMessage(
        { ...valid, valid: false, valueMissing: true },
        "zh",
        "text",
      ),
    ).toBe("请填写此项。");
    expect(
      customerValidationMessage(
        { ...valid, valid: false, valueMissing: true },
        "en",
        "checkbox",
      ),
    ).toBe("Confirm this option to continue.");
  });
  it.each([
    "tooShort",
    "tooLong",
    "rangeUnderflow",
    "rangeOverflow",
    "stepMismatch",
    "badInput",
    "patternMismatch",
    "customError",
  ] as const)("provides safe guidance for %s", (key) => {
    expect(
      customerValidationMessage(
        { ...valid, valid: false, [key]: true },
        "en",
        "text",
      ),
    ).toBeTruthy();
    expect(
      customerValidationMessage(
        { ...valid, valid: false, [key]: true },
        "zh",
        "text",
      ),
    ).toBeTruthy();
  });
});
