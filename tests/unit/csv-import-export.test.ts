import { describe, it, expect } from "vitest";
import {
  parseProductCsv,
  type ProductCsvRow,
} from "@/application/use-cases/catalog/import-products-csv";

describe("Product CSV parser (parseProductCsv)", () => {
  it("parses valid CSV with required and optional columns", () => {
    const csv = [
      "handle,sku,title,variant_title,description,price_cents,is_available,is_published",
      't-shirt,TS-BLK-S,"Classic T-Shirt","Small / Black","100% cotton",2500,true,true',
      't-shirt,TS-BLK-M,"Classic T-Shirt","Medium / Black","100% cotton",2500,1,1',
      'mug,MUG-WHT,"Ceramic Mug","Standard","White ceramic",1500,yes,false',
    ].join("\n");

    const { rows, errors } = parseProductCsv(csv);

    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(3);

    expect(rows[0]).toEqual({
      handle: "t-shirt",
      sku: "TS-BLK-S",
      productTitle: "Classic T-Shirt",
      variantTitle: "Small / Black",
      description: "100% cotton",
      priceCents: 2500,
      isAvailable: true,
      isPublished: true,
    });

    expect(rows[1]).toMatchObject({
      handle: "t-shirt",
      sku: "TS-BLK-M",
      priceCents: 2500,
      isAvailable: true,
      isPublished: true,
    });

    expect(rows[2]).toMatchObject({
      handle: "mug",
      sku: "MUG-WHT",
      variantTitle: "Standard",
      priceCents: 1500,
      isAvailable: true,
      isPublished: false,
    });
  });

  it("handles default fallback values for optional columns", () => {
    const csv = [
      "handle,sku,title,price_cents",
      "minimal,MIN-01,Minimal Item,1200",
    ].join("\n");

    const { rows, errors } = parseProductCsv(csv);

    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      handle: "minimal",
      sku: "MIN-01",
      productTitle: "Minimal Item",
      variantTitle: "Minimal Item", // falls back to productTitle
      description: "",
      priceCents: 1200,
      isAvailable: true, // defaults to true
      isPublished: true, // defaults to true
    });
  });

  it("returns error if required header columns are missing", () => {
    const csv = ["handle,title,price_cents", "item,Item Title,1000"].join("\n");

    const { rows, errors } = parseProductCsv(csv);

    expect(rows).toHaveLength(0);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.some((e) => e.field === "sku")).toBe(true);
  });

  it("returns errors for missing required row fields", () => {
    const csv = [
      "handle,sku,title,price_cents",
      ",SKU-1,Title,1000",
      "handle-2,,Title 2,2000",
      "handle-3,SKU-3,,3000",
    ].join("\n");

    const { errors } = parseProductCsv(csv);

    expect(errors).toHaveLength(3);
    expect(errors.find((e) => e.line === 2)?.field).toBe("handle");
    expect(errors.find((e) => e.line === 3)?.field).toBe("sku");
    expect(errors.find((e) => e.line === 4)?.field).toBe("title");
  });

  it("rejects invalid or negative price_cents", () => {
    const csv = [
      "handle,sku,title,price_cents",
      "item1,SKU-1,Title,not-a-number",
      "item2,SKU-2,Title,-500",
    ].join("\n");

    const { errors } = parseProductCsv(csv);

    expect(errors).toHaveLength(2);
    expect(errors.every((e) => e.field === "price_cents")).toBe(true);
  });

  it("detects duplicate SKUs within the same CSV", () => {
    const csv = [
      "handle,sku,title,price_cents",
      "item1,SKU-DUP,Title 1,1000",
      "item2,SKU-DUP,Title 2,2000",
    ].join("\n");

    const { errors } = parseProductCsv(csv);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.field).toBe("sku");
    expect(errors[0]!.message).toContain("Duplicate SKU");
  });

  it("handles quoted fields with commas and escaped quotes correctly", () => {
    const csv = [
      "handle,sku,title,description,price_cents",
      'item,SKU-QUOTE,"Special, Item","Has ""quotes"" and, commas",4500',
    ].join("\n");

    const { rows, errors } = parseProductCsv(csv);

    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.productTitle).toBe("Special, Item");
    expect(rows[0]!.description).toBe('Has "quotes" and, commas');
  });

  it("handles blank lines gracefully", () => {
    const csv = [
      "handle,sku,title,price_cents",
      "",
      "item,SKU-1,Title,1000",
      "   ",
      "item2,SKU-2,Title 2,2000",
      "",
    ].join("\n");

    const { rows, errors } = parseProductCsv(csv);

    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(2);
  });
});
