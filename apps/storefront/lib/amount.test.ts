import { expect, it } from "vitest";
import { creditMinorUnits } from "./amount";
it("converts currency input exactly without floating-point rounding", () => {
  expect(creditMinorUnits("0.29", 2)).toBe(29);
  expect(creditMinorUnits("10", 0)).toBe(10);
  expect(creditMinorUnits("1.234", 3)).toBe(1234);
});
it("rejects excess precision, negative input and unsafe currency amounts", () => {
  for (const value of ["1.001", "-1", "1e3", "9999999999999"]) {
    expect(() => creditMinorUnits(value, 2)).toThrow();
  }
});
