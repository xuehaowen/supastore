import { describe, expect, it } from "vitest";
import {
  fiscalReportPeriod,
  localReportDate,
  offsetReportDate,
  reportDate,
  salesReportCsv,
  summarizeSalesReport,
  type SalesReportRow,
} from "@/domain/sales-report";
const row = (
  kind: SalesReportRow["kind"],
  values: Partial<SalesReportRow> = {},
): SalesReportRow => ({
  id: kind,
  date: "2026-10-05",
  kind,
  orderId: null,
  method: "other",
  netCents: 0,
  taxCents: 0,
  collectionCents: 0,
  payoutCents: 0,
  creditLiabilityDeltaCents: 0,
  reason: "",
  ...values,
});
describe("generic sales report accounting", () => {
  it("offsets merchant calendar dates across month, leap-day and DST boundaries", () => {
    expect(offsetReportDate("2028-02-28", 1)).toBe("2028-02-29");
    expect(offsetReportDate("2026-03-08", -1)).toBe("2026-03-07");
    expect(offsetReportDate("2026-03-08", 1)).toBe("2026-03-09");
    expect(offsetReportDate("2026-01-01", -29)).toBe("2025-12-03");
  });
  it("recognizes a credit-funded purchase once and distinguishes collections, refunds and liabilities", () => {
    expect(
      summarizeSalesReport([
        row("sale", { netCents: 9000, taxCents: 1000 }),
        row("receipt", { collectionCents: 7000 }),
        row("credit", { creditLiabilityDeltaCents: -3000 }),
        row("refund", { netCents: -4500, taxCents: -500 }),
        row("payout", { payoutCents: 3500 }),
        row("credit", { id: "restoration", creditLiabilityDeltaCents: 1500 }),
        row("outside_adjustment", { netCents: 200, taxCents: 20 }),
      ]),
    ).toEqual({
      netSalesCents: 4700,
      taxCents: 520,
      grossSalesCents: 5220,
      collectionsCents: 7000,
      customerPayoutsCents: 3500,
      creditLiabilityDeltaCents: -1500,
      refundsAuthorizedCents: 5000,
      outsideNetSalesCents: 200,
    });
  });
  it("counts receipt corrections in collections without rewriting historical sales", () => {
    expect(
      summarizeSalesReport([
        row("sale", { netCents: 1000 }),
        row("receipt", { collectionCents: 1000 }),
        row("receipt_correction", { collectionCents: -100 }),
      ]),
    ).toMatchObject({ netSalesCents: 1000, collectionsCents: 900 });
  });
  it("rejects duplicate report identities and unsafe arithmetic", () => {
    expect(() => summarizeSalesReport([row("sale"), row("sale")])).toThrow(
      "Duplicate",
    );
    expect(() =>
      summarizeSalesReport([row("sale", { netCents: 0.5 })]),
    ).toThrow();
    expect(() =>
      summarizeSalesReport([
        row("sale", { netCents: Number.MAX_SAFE_INTEGER }),
        row("outside_adjustment", { netCents: 1 }),
      ]),
    ).toThrow();
  });
  it.each(["2026-02-29", "2026-13-01", "2026-01-00", "2026-1-01", "yesterday"])(
    "rejects invalid date %s",
    (value) => {
      expect(() => reportDate(value)).toThrow();
    },
  );
  it("retains leap days and uses the merchant timezone across DST boundaries", () => {
    expect(reportDate("2024-02-29")).toBe("2024-02-29");
    expect(
      localReportDate(new Date("2026-01-02T07:59:59Z"), "America/Los_Angeles"),
    ).toBe("2026-01-01");
    expect(
      localReportDate(new Date("2026-01-02T08:00:00Z"), "America/Los_Angeles"),
    ).toBe("2026-01-02");
    expect(
      localReportDate(new Date("2026-03-08T09:59:00Z"), "America/Los_Angeles"),
    ).toBe("2026-03-08");
    expect(
      localReportDate(new Date("2026-03-08T10:00:00Z"), "America/Los_Angeles"),
    ).toBe("2026-03-08");
  });
  it("resolves fiscal years before and at the configured opening month", () => {
    expect(fiscalReportPeriod("2026-03-31", 4)).toEqual({
      start: "2025-04-01",
      endExclusive: "2026-04-01",
    });
    expect(fiscalReportPeriod("2026-04-01", 4)).toEqual({
      start: "2026-04-01",
      endExclusive: "2027-04-01",
    });
    expect(fiscalReportPeriod("2026-01-01", 1)).toEqual({
      start: "2026-01-01",
      endExclusive: "2027-01-01",
    });
    expect(() => fiscalReportPeriod("2026-01-01", 0)).toThrow();
  });
  it("exports original identities, escaped quotes/newlines and inert spreadsheet formulas", () => {
    const output = salesReportCsv([
      row("outside_adjustment", {
        reason: '=HYPERLINK("https://example.test")\nline',
        netCents: -100,
      }),
    ]);
    expect(output).toContain('"\'=HYPERLINK(""https://example.test"")\nline"');
    expect(output).toContain('"-100"');
    expect(output.startsWith("id,date,kind,orderId,method")).toBe(true);
    expect(output.endsWith("\r\n")).toBe(true);
  });
});
