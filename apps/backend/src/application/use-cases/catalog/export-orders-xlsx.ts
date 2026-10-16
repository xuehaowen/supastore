import ExcelJS from "exceljs";
import { ORDER_EXPORT_COLUMNS, streamOrderExportRows } from "./export-csv";
import { DomainError } from "@/domain/errors";
import type { OrderExportSelection } from "@/domain/catalog/order-export-selection";

const MAX_ROWS = 10000;

export async function exportOrdersXlsx(
  selection: OrderExportSelection = {},
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Supastore";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Orders", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = ORDER_EXPORT_COLUMNS.map((key) => ({
    key,
    header: key.replaceAll("_", " "),
    width: key === "guest_email" ? 28 : key === "created_at" ? 22 : 18,
  }));
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: ORDER_EXPORT_COLUMNS.length },
  };
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF17252A" },
  };
  let rowCount = 0;
  for await (const row of streamOrderExportRows(selection)) {
    if (++rowCount > MAX_ROWS)
      throw new DomainError(
        "XLSX exports support up to 10,000 rows. Use the streaming CSV export for larger downloads.",
      );
    if (
      Object.values(row).some(
        (value) => typeof value === "string" && value.length > 32767,
      )
    )
      throw new DomainError(
        "A value exceeds the XLSX cell limit. Use the streaming CSV export.",
      );
    sheet.addRow(row);
  }
  for (const key of [
    "discount_cents",
    "purchase_total_cents",
    "quantity",
    "unit_price_cents",
    "line_total_cents",
  ])
    sheet.getColumn(key).numFmt = "#,##0";
  sheet.getColumn("created_at").numFmt = "mm/dd/yy hh:mm";
  const output = await workbook.xlsx.writeBuffer();
  const source = output as unknown as Uint8Array;
  const bytes = new Uint8Array(source.byteLength);
  bytes.set(source);
  return bytes.buffer;
}
