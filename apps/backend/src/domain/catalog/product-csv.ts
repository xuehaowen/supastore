export interface ProductCsvRow {
  handle: string;
  sku: string;
  variantTitle: string;
  productTitle: string;
  description: string;
  priceCents: number;
  isAvailable: boolean;
  isPublished: boolean;
  optionValues?: Record<string, string>;
  collectionHandles?: string[];
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
export function serializeProductCsv(rows: ProductCsvRow[]) {
  const cell = (value: unknown) =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;
  return (
    "handle,sku,title,variant_title,description,price_cents,is_available,is_published,option_values,collection_handles\r\n" +
    rows
      .map((r) =>
        [
          r.handle,
          r.sku,
          r.productTitle,
          r.variantTitle,
          r.description,
          r.priceCents,
          r.isAvailable,
          r.isPublished,
          Object.entries(r.optionValues || {})
            .map(([a, v]) => `${a}:${v}`)
            .join("|"),
          (r.collectionHandles || []).join("|"),
        ]
          .map(cell)
          .join(","),
      )
      .join("\r\n")
  );
}
export function parseProductCsv(csvText: string): {
  rows: ProductCsvRow[];
  errors: CsvParseError[];
} {
  const rows: ProductCsvRow[] = [],
    errors: CsvParseError[] = [];
  if (csvText.length > 5 * 1024 * 1024)
    return {
      rows,
      errors: [{ line: 1, field: "file", message: "File exceeds 5 MB limit." }],
    };
  const records: { cells: string[]; line: number }[] = [];
  let cells: string[] = [],
    text = "",
    quoted = false,
    closed = false,
    line = 1,
    start = 1;
  for (let i = 0; i <= csvText.length; i++) {
    const char = csvText[i];
    if (quoted) {
      if (char === '"') {
        if (csvText[i + 1] === '"') {
          text += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else if (char === undefined) {
        errors.push({
          line: start,
          field: "file",
          message: "Unclosed quoted field.",
        });
        break;
      } else {
        text += char;
        if (char === "\n") line++;
      }
    } else if (char === '"' && !text && !closed) quoted = true;
    else if (char === "," || char === "\n" || char === undefined) {
      cells.push(text.replace(/\r$/, ""));
      text = "";
      closed = false;
      if (char !== ",") {
        if (cells.some((c) => c.trim())) records.push({ cells, line: start });
        cells = [];
        line++;
        start = line;
      }
    } else if (closed && char !== "\r") {
      errors.push({
        line: start,
        field: "file",
        message: "Unexpected character after quoted field.",
      });
      break;
    } else if (char === '"') {
      errors.push({
        line: start,
        field: "file",
        message: "Quote must start a quoted field.",
      });
      break;
    } else text += char;
  }
  if (errors.length) return { rows, errors };
  const headers =
    records.shift()?.cells.map((h) =>
      h
        .trim()
        .replace(/^\uFEFF/, "")
        .toLowerCase(),
    ) || [];
  for (const required of ["handle", "sku", "title", "price_cents"])
    if (!headers.includes(required))
      errors.push({
        line: 1,
        field: required,
        message: `Required column '${required}' is missing from header row`,
      });
  if (new Set(headers).size !== headers.length)
    errors.push({
      line: 1,
      field: "header",
      message: "Column names must be unique.",
    });
  if (errors.length) return { rows, errors };
  const seen = new Set<string>();
  for (const record of records) {
    const get = (key: string) =>
      record.cells[headers.indexOf(key)]?.trim() || "";
    const fail = (field: string, message: string) =>
      errors.push({ line: record.line, field, message });
    const handle = get("handle"),
      sku = get("sku"),
      title = get("title"),
      price = get("price_cents");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(handle) || handle.length > 100)
      fail(
        "handle",
        "handle must use lowercase letters, numbers and hyphens, up to 100 characters.",
      );
    if (!sku || sku.length > 200)
      fail("sku", "sku is required, up to 200 characters.");
    if (!title || title.length > 200)
      fail("title", "title is required, up to 200 characters.");
    if (get("variant_title").length > 200 || get("description").length > 10000)
      fail(
        "description",
        "Variant names support 200 characters; descriptions support 10,000.",
      );
    if (
      !/^\d+$/.test(price) ||
      !Number.isSafeInteger(Number(price)) ||
      Number(price) > 2147483647
    )
      fail(
        "price_cents",
        `price_cents must be a non-negative integer (got '${price}')`,
      );
    const boolean = (key: string) => {
      const value = get(key).toLowerCase();
      if (!value) return true;
      if (["true", "1", "yes", "y", "t"].includes(value)) return true;
      if (["false", "0", "no", "n", "f"].includes(value)) return false;
      fail(key, "Use true or false.");
      return false;
    };
    const isAvailable = boolean("is_available"),
      isPublished = boolean("is_published");
    if (seen.has(sku)) fail("sku", `Duplicate SKU '${sku}' in this file`);
    seen.add(sku);
    const optionValues: Record<string, string> = {};
    for (const pair of get("option_values").split("|").filter(Boolean)) {
      const parts = pair.split(":");
      if (
        parts.length !== 2 ||
        !parts.every((p) => /^[a-z0-9-]{1,40}$/.test(p)) ||
        parts[0]! in optionValues
      )
        fail(
          "option_values",
          "Use distinct attribute:value codes, such as color:red|size:m.",
        );
      else optionValues[parts[0]!] = parts[1]!;
    }
    if (Object.keys(optionValues).length > 4)
      fail("option_values", "A product supports up to four option axes.");
    const collectionHandles = get("collection_handles")
      .split("|")
      .filter(Boolean);
    if (
      collectionHandles.length > 20 ||
      collectionHandles.some(
        (h) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(h) || h.length > 100,
      )
    )
      fail(
        "collection_handles",
        "Use up to 20 collection handles separated by |.",
      );
    if (!errors.some((e) => e.line === record.line))
      rows.push({
        handle,
        sku,
        productTitle: title,
        variantTitle: get("variant_title") || title,
        description: get("description"),
        priceCents: Number(price),
        isAvailable,
        isPublished,
        ...(Object.keys(optionValues).length ? { optionValues } : {}),
        ...(collectionHandles.length
          ? { collectionHandles: [...new Set(collectionHandles)] }
          : {}),
      });
  }
  return { rows, errors };
}
