import ExcelJS from "exceljs";
import { afterEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ rows: 1, name: "Buyer" }));
afterEach(() => {
  fixture.rows = 1;
  fixture.name = "Buyer";
});

vi.mock("@/application/use-cases/catalog/export-csv", () => ({
  ORDER_EXPORT_COLUMNS: [
    "reference_code",
    "lifecycle_status",
    "guest_email",
    "guest_name",
    "fulfillment_type",
    "fulfillment_status",
    "discount",
    "purchase_total",
    "sku",
    "variant_title",
    "quantity",
    "unit_price",
    "line_total",
    "receipt_references",
    "created_at",
  ],
  streamOrderExportRows: async function* () {
    for (let index = 0; index < fixture.rows; index++) {
      yield {
        reference_code: "SP-100",
        lifecycle_status: "confirmed",
        guest_email: "buyer@example.test",
        guest_name: fixture.name,
        fulfillment_type: "shipping",
        fulfillment_status: "unfulfilled",
        discount: 2.5,
        purchase_total: 22.5,
        sku: "CUP-1",
        variant_title: "Cup",
        quantity: 2,
        unit_price: 12.5,
        line_total: 25,
        receipt_references: "BANK-100",
        created_at: new Date("2026-09-14T12:00:00Z"),
      };
    }
  },
}));

import { exportOrdersXlsx } from "@/application/use-cases/catalog/export-orders-xlsx";

describe("order XLSX export", () => {
  it("rejects cells that exceed the spreadsheet format limit", async () => {
    fixture.name = "x".repeat(32768);
    await expect(exportOrdersXlsx()).rejects.toThrow("cell limit");
  });
  it("accepts the maximum supported row count", async () => {
    fixture.rows = 10000;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await exportOrdersXlsx()) as never);
    expect(workbook.getWorksheet("Orders")!.rowCount).toBe(10001);
  });
  it("rejects oversized workbooks and directs merchants to the streaming CSV export", async () => {
    fixture.rows = 10001;
    await expect(exportOrdersXlsx()).rejects.toThrow("10,000");
  });
  it("creates a filterable workbook with typed order values", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await exportOrdersXlsx()) as never);
    const sheet = workbook.getWorksheet("Orders")!;
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(sheet.autoFilter).toEqual("A1:O1");
    expect(sheet.getCell("A2").value).toBe("SP-100");
    expect(sheet.getCell("G2").value).toBe(2.5);
    expect(sheet.getCell("H2").value).toBe(22.5);
    expect(sheet.getCell("G2").numFmt).toBe("#,##0.00####");
    expect(sheet.getCell("O2").value).toEqual(new Date("2026-09-14T12:00:00Z"));
  });
});
