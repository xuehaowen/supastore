import { eq, inArray } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import { products, productVariants } from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { InvariantViolationError } from "@/application/common/errors";

// ---------------------------------------------------------------------------
// CSV row shape after parsing
// ---------------------------------------------------------------------------
export interface ProductCsvRow {
  handle: string;
  sku: string;
  variantTitle: string;
  productTitle: string;
  description: string;
  priceCents: number;
  isAvailable: boolean;
  isPublished: boolean;
}

export interface CsvParseError {
  line: number;
  field: string;
  message: string;
}

export interface CsvPreview {
  rows: ProductCsvRow[];
  errors: CsvParseError[];
  newHandles: string[];
  updatedHandles: string[];
  newSkus: string[];
  updatedSkus: string[];
}

// ---------------------------------------------------------------------------
// Parse and validate CSV text (runs both in main thread and Web Worker)
// ---------------------------------------------------------------------------
export function parseProductCsv(csvText: string): {
  rows: ProductCsvRow[];
  errors: CsvParseError[];
} {
  const REQUIRED_HEADERS = ["handle", "sku", "title", "price_cents"] as const;
  const rows: ProductCsvRow[] = [];
  const errors: CsvParseError[] = [];

  const lines = csvText.split(/\r?\n/);
  if (lines.length === 0) {
    errors.push({ line: 0, field: "header", message: "File is empty" });
    return { rows, errors };
  }

  // Parse header line
  const headerLine = lines[0]!.trim();
  const headers = headerLine.split(",").map((h) => h.trim().toLowerCase());

  for (const required of REQUIRED_HEADERS) {
    if (!headers.includes(required)) {
      errors.push({
        line: 1,
        field: required,
        message: `Required column '${required}' is missing from header row`,
      });
    }
  }

  if (errors.length > 0) return { rows, errors };

  // Index helpers
  const idx = (col: string) => headers.indexOf(col);
  const cell = (cols: string[], col: string) => cols[idx(col)]?.trim() ?? "";

  // Track seen SKUs within this file for duplicate detection
  const seenSkus = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue; // skip blank lines

    // Simple CSV split (handles quoted fields)
    const cols = parseCsvLine(line);
    const lineNum = i + 1;

    const handle = cell(cols, "handle");
    const sku = cell(cols, "sku");
    const productTitle = cell(cols, "title");
    const variantTitle = cell(cols, "variant_title") || productTitle;
    const description = cell(cols, "description");
    const priceRaw = cell(cols, "price_cents");
    const isAvailableRaw = cell(cols, "is_available");
    const isPublishedRaw = cell(cols, "is_published");

    if (!handle) {
      errors.push({ line: lineNum, field: "handle", message: "handle is required" });
    }
    if (!sku) {
      errors.push({ line: lineNum, field: "sku", message: "sku is required" });
    }
    if (!productTitle) {
      errors.push({ line: lineNum, field: "title", message: "title is required" });
    }

    const priceCents = parseInt(priceRaw, 10);
    if (isNaN(priceCents) || priceCents < 0) {
      errors.push({
        line: lineNum,
        field: "price_cents",
        message: `price_cents must be a non-negative integer (got '${priceRaw}')`,
      });
    }

    if (sku && seenSkus.has(sku)) {
      errors.push({ line: lineNum, field: "sku", message: `Duplicate SKU '${sku}' in this file` });
    } else if (sku) {
      seenSkus.add(sku);
    }

    if (errors.some((e) => e.line === lineNum)) continue;

    rows.push({
      handle,
      sku,
      variantTitle,
      productTitle,
      description,
      priceCents,
      isAvailable: parseBoolean(isAvailableRaw, true),
      isPublished: parseBoolean(isPublishedRaw, true),
    });
  }

  return { rows, errors };
}

function parseBoolean(val: string, defaultVal: boolean): boolean {
  if (!val) return defaultVal;
  const lower = val.trim().toLowerCase();
  if (["true", "1", "yes", "y", "t"].includes(lower)) return true;
  if (["false", "0", "no", "n", "f"].includes(lower)) return false;
  return defaultVal;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ---------------------------------------------------------------------------
// Import execution use case — atomic upsert within a single transaction
// ---------------------------------------------------------------------------
export interface ImportProductsCsvInput {
  rows: ProductCsvRow[];
  staffUserId: string;
}

export interface ImportResult {
  created: number;
  updated: number;
}

export async function importProductsCsv(input: ImportProductsCsvInput): Promise<ImportResult> {
  if (input.rows.length === 0) {
    throw new InvariantViolationError("No rows to import.");
  }

  return await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.staffUserId);

    let created = 0;
    let updated = 0;

    // Fetch existing products by handle in one query
    const handles = [...new Set(input.rows.map((r) => r.handle))];
    const existingProducts = await tx
      .select({ id: products.id, handle: products.handle })
      .from(products)
      .where(inArray(products.handle, handles));

    const productByHandle = new Map(existingProducts.map((p) => [p.handle, p]));

    // Fetch existing variants by sku in one query
    const skus = input.rows.map((r) => r.sku);
    const existingVariants = await tx
      .select({ id: productVariants.id, sku: productVariants.sku })
      .from(productVariants)
      .where(inArray(productVariants.sku, skus));

    const variantBySku = new Map(existingVariants.map((v) => [v.sku, v]));

    for (const row of input.rows) {
      // Upsert product
      let productId: string;
      const existing = productByHandle.get(row.handle);

      if (existing) {
        await tx
          .update(products)
          .set({
            title: row.productTitle,
            description: row.description,
            isPublished: row.isPublished,
            updatedAt: new Date(),
          })
          .where(eq(products.id, existing.id));
        productId = existing.id;
      } else {
        const [inserted] = await tx
          .insert(products)
          .values({
            handle: row.handle,
            title: row.productTitle,
            description: row.description,
            isPublished: row.isPublished,
          })
          .returning({ id: products.id });
        productId = inserted!.id;
        productByHandle.set(row.handle, { id: productId, handle: row.handle });
      }

      // Upsert variant
      const existingVariant = variantBySku.get(row.sku);
      if (existingVariant) {
        await tx
          .update(productVariants)
          .set({
            title: row.variantTitle,
            priceCents: row.priceCents,
            isAvailable: row.isAvailable,
            updatedAt: new Date(),
          })
          .where(eq(productVariants.id, existingVariant.id));
        updated++;
      } else {
        await tx.insert(productVariants).values({
          productId,
          sku: row.sku,
          title: row.variantTitle,
          priceCents: row.priceCents,
          isAvailable: row.isAvailable,
        });
        created++;
      }
    }

    return { created, updated };
  });
}
