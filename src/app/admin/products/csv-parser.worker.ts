/**
 * CSV parse Web Worker — runs parseProductCsv in a background thread so the
 * main thread remains responsive when the user selects a large file.
 *
 * This file is intentionally a plain JS-compatible script so it can be used
 * directly as a Web Worker via: new Worker(new URL('./csv-parser.worker.ts', import.meta.url))
 *
 * Messages IN:  { type: 'parse', csvText: string }
 * Messages OUT: { type: 'result', rows: ProductCsvRow[], errors: CsvParseError[] }
 *              | { type: 'error', message: string }
 */

// Inline the pure parser to avoid bundler issues in worker context
interface ProductCsvRow {
  handle: string;
  sku: string;
  variantTitle: string;
  productTitle: string;
  description: string;
  priceCents: number;
  isAvailable: boolean;
  isPublished: boolean;
}

interface CsvParseError {
  line: number;
  field: string;
  message: string;
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

function parseProductCsv(csvText: string): {
  rows: ProductCsvRow[];
  errors: CsvParseError[];
} {
  const REQUIRED_HEADERS = ["handle", "sku", "title", "price_cents"];
  const rows: ProductCsvRow[] = [];
  const errors: CsvParseError[] = [];

  const lines = csvText.split(/\r?\n/);
  if (lines.length === 0) {
    errors.push({ line: 0, field: "header", message: "File is empty" });
    return { rows, errors };
  }

  const headers = lines[0]!.trim().split(",").map((h) => h.trim().toLowerCase());

  for (const required of REQUIRED_HEADERS) {
    if (!headers.includes(required)) {
      errors.push({ line: 1, field: required, message: `Required column '${required}' is missing` });
    }
  }
  if (errors.length > 0) return { rows, errors };

  const idx = (col: string) => headers.indexOf(col);
  const cell = (cols: string[], col: string) => cols[idx(col)]?.trim() ?? "";

  const seenSkus = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;

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

    if (!handle) errors.push({ line: lineNum, field: "handle", message: "handle is required" });
    if (!sku) errors.push({ line: lineNum, field: "sku", message: "sku is required" });
    if (!productTitle) errors.push({ line: lineNum, field: "title", message: "title is required" });

    const priceCents = parseInt(priceRaw, 10);
    if (isNaN(priceCents) || priceCents < 0) {
      errors.push({ line: lineNum, field: "price_cents", message: `price_cents must be a non-negative integer (got '${priceRaw}')` });
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

self.addEventListener("message", (event: MessageEvent<{ type: string; csvText: string }>) => {
  if (event.data.type === "parse") {
    try {
      const result = parseProductCsv(event.data.csvText);
      self.postMessage({ type: "result", ...result });
    } catch (err) {
      self.postMessage({
        type: "error",
        message: err instanceof Error ? err.message : "Parse error",
      });
    }
  }
});
