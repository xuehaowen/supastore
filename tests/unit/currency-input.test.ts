import { describe, expect, it } from "vitest";
import { decimalToMinor, minorToDecimal } from "@/domain/money/decimal-input";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CurrencyField } from "@/app/admin/currency-field";

describe("admin currency entry", () => {
  it("converts decimal amounts exactly for each supported precision", () => {
    expect(decimalToMinor("12.50", 2)).toBe(1250);
    expect(decimalToMinor("0.29", 2)).toBe(29);
    expect(decimalToMinor("1250", 0)).toBe(1250);
    expect(decimalToMinor("1.2345", 4)).toBe(12345);
    expect(decimalToMinor("-0.01", 2, true)).toBe(-1);
    expect(minorToDecimal(1, 2)).toBe("0.01");
    expect(minorToDecimal(-1250, 2)).toBe("-12.50");
  });
  it("rejects overprecision, exponents, invalid text, negatives and overflow", () => {
    for (const value of ["", "1.001", "1e2", "1,000", "-1", "21474836.48"])
      expect(decimalToMinor(value, 2)).toBeNull();
    expect(decimalToMinor("1.1", 0)).toBeNull();
  });
  it("submits only canonical integer fields for detailed refunds", () => {
    const html = renderToStaticMarkup(
      createElement(CurrencyField, {
        name: "external:line-id",
        label: "External refund",
        value: 1250,
        currency: "USD",
        precision: 2,
      }),
    );
    expect(html).toContain('value="12.50"');
    expect(html).toContain(
      'type="hidden" name="external:line-id" value="1250"',
    );
    expect([...html.matchAll(/\sname="/g)]).toHaveLength(1);
  });
});
