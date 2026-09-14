import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/application/use-cases/catalog/export-csv", () => ({
  ORDER_EXPORT_COLUMNS: [
    "reference_code",
    "lifecycle_status",
    "guest_email",
    "guest_name",
    "fulfillment_type",
    "fulfillment_status",
    "discount_cents",
    "purchase_total_cents",
    "sku",
    "variant_title",
    "quantity",
    "unit_price_cents",
    "line_total_cents",
    "receipt_references",
    "created_at",
  ],
  streamOrderExportRows: async function* () {
    yield {
      reference_code: "SP-100",
      lifecycle_status: "confirmed",
      guest_email: "buyer@example.test",
      guest_name: "Buyer",
      fulfillment_type: "shipping",
      fulfillment_status: "unfulfilled",
      discount_cents: 250,
      purchase_total_cents: 2250,
      sku: "CUP-1",
      variant_title: "Cup",
      quantity: 2,
      unit_price_cents: 1250,
      line_total_cents: 2500,
      receipt_references: "BANK-100",
      created_at: new Date("2026-09-14T12:00:00Z"),
    };
  },
}));

import { exportOrdersXlsx } from "@/application/use-cases/catalog/export-orders-xlsx";

describe("order XLSX export", () => {
  it("creates a filterable workbook with typed order values", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await exportOrdersXlsx()) as never);
    const sheet = workbook.getWorksheet("Orders")!;
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(sheet.autoFilter).toEqual("A1:O1");
    expect(sheet.getCell("A2").value).toBe("SP-100");
    expect(sheet.getCell("G2").value).toBe(250);
    expect(sheet.getCell("H2").value).toBe(2250);
    expect(sheet.getCell("O2").value).toEqual(new Date("2026-09-14T12:00:00Z"));
  });
});
