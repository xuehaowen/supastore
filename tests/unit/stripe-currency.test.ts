import { afterEach, describe, expect, it, vi } from "vitest";
import {
  stripeConfiguredFor,
  stripeCurrencyIssue,
} from "@/domain/stripe-currency";
afterEach(() => vi.unstubAllEnvs());
describe("Stripe charge currency units", () => {
  it("fails closed for mismatched or unverified units without converting amounts", () => {
    expect(stripeCurrencyIssue("USD", 0, 100)).toContain("precision 2");
    expect(stripeCurrencyIssue("JPY", 2, 10000)).toContain("precision 0");
    expect(stripeCurrencyIssue("XYZ", 2, 100)).toContain("not verified");
    expect(stripeCurrencyIssue("KWD", 3, 1000)).toContain("not verified");
    expect(stripeCurrencyIssue("USD", 2, 100)).toBeNull();
    expect(stripeCurrencyIssue("CNY", 2, 100)).toBeNull();
    expect(stripeCurrencyIssue("jpy", 0, 100)).toBeNull();
    expect(stripeCurrencyIssue("HUF", 2, 101)).toBeNull();
    expect(stripeCurrencyIssue("TWD", 2, 101)).toBeNull();
    for (const code of "BIF CLP DJF GNF JPY KMF KRW MGA PYG RWF VND VUV XAF XOF XPF".split(
      " ",
    )) {
      expect(stripeCurrencyIssue(code, 0, 100)).toBeNull();
      expect(stripeCurrencyIssue(code, 2, 100)).toContain("precision 0");
    }
    expect(stripeCurrencyIssue("USD", 2, 1.5)).toContain("minor units");
  });
  it("uses ISK/UGX two-decimal backwards-compatible amounts with no fractional units", () => {
    for (const code of ["ISK", "UGX"]) {
      expect(stripeCurrencyIssue(code, 0, 5)).toContain("precision 2");
      expect(stripeCurrencyIssue(code, 2, 500)).toBeNull();
      expect(stripeCurrencyIssue(code, 2, 501)).toContain("whole");
    }
  });
  it("requires compatible units and both provider credentials for public readiness", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fixture");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_fixture");
    expect(stripeConfiguredFor({ currency: "USD", precision: 2 })).toBe(true);
    expect(stripeConfiguredFor({ currency: "USD", precision: 0 })).toBe(false);
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    expect(stripeConfiguredFor({ currency: "USD", precision: 2 })).toBe(false);
  });
});
