import { afterEach, expect, it, vi } from "vitest";
import {
  reportAmount,
  reportBudgets,
} from "@/application/use-cases/reports/report-workspace";
afterEach(() => vi.unstubAllEnvs());
it.each([null, undefined, "", "1.5", "9007199254740993", { value: 1 }])(
  "rejects invalid or imprecise report amounts %o",
  (value) => {
    expect(() => reportAmount(value)).toThrow();
  },
);
it("retains exact signed amounts at the supported precision boundary", () => {
  expect(reportAmount("-9007199254740991")).toBe(Number.MIN_SAFE_INTEGER);
  expect(reportAmount("9007199254740991")).toBe(Number.MAX_SAFE_INTEGER);
});
it.each([
  ["REPORT_MAX_SOURCE_ROWS", "0"],
  ["REPORT_MAX_SOURCE_ROWS", "1000001"],
  ["REPORT_TIMEOUT_MS", "999"],
  ["REPORT_MAX_EXPORT_BYTES", "268435457"],
])("rejects unsupported report configuration %s=%s", (name, value) => {
  vi.stubEnv(name, value);
  expect(reportBudgets).toThrow();
});
