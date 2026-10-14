"use client";

import { useRef, useState, useCallback } from "react";
import { Button } from "@supastore/ui/button";
import { AdminNav } from "@/app/admin/admin-nav";
import { CatalogTabs } from "@/app/admin/catalog-tabs";
import { Input } from "@supastore/ui/input";
import { Alert, AlertDescription } from "@supastore/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@supastore/ui/table";
import { downloadAdminExport, importProductsCsv } from "@/app/client-requests";
import type { ProductCsvRow } from "@/domain/catalog/product-csv";

interface CsvParseError {
  line: number;
  field: string;
  message: string;
}

type PreviewState =
  | { status: "idle" }
  | { status: "parsing" }
  | { status: "errors"; errors: CsvParseError[] }
  | { status: "ready"; rows: ProductCsvRow[] }
  | { status: "importing" }
  | { status: "done"; created: number; updated: number }
  | { status: "failed"; message: string };

export default function ProductImportExportPage() {
  const [preview, setPreview] = useState<PreviewState>({ status: "idle" });
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState<"products" | "orders" | null>(
    null,
  );
  const [parsedRows, setParsedRows] = useState<ProductCsvRow[]>([]);
  const fileRef = useRef<File | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      fileRef.current = file;
      setPreview({ status: "parsing" });
      setParsedRows([]);

      // Use Web Worker for off-main-thread parsing
      const worker = new Worker(
        new URL("../csv-parser.worker.ts", import.meta.url),
      );
      workerRef.current = worker;

      const reader = new FileReader();
      reader.onload = (ev) => {
        const csvText = ev.target?.result as string;
        worker.postMessage({ type: "parse", csvText });
      };
      reader.readAsText(file, "utf-8");

      worker.onmessage = (ev: MessageEvent) => {
        worker.terminate();
        workerRef.current = null;
        if (ev.data.type === "error") {
          setPreview({ status: "failed", message: ev.data.message });
          return;
        }
        const { rows, errors } = ev.data as {
          rows: ProductCsvRow[];
          errors: CsvParseError[];
        };
        if (errors.length > 0) {
          setPreview({ status: "errors", errors });
        } else {
          setParsedRows(rows);
          setPreview({ status: "ready", rows });
        }
      };

      worker.onerror = () => {
        setPreview({
          status: "failed",
          message: "Web Worker error during parse",
        });
        worker.terminate();
        workerRef.current = null;
      };
    },
    [],
  );

  const handleImport = useCallback(async () => {
    if (!fileRef.current || parsedRows.length === 0) return;
    setPreview({ status: "importing" });

    try {
      const data = await importProductsCsv(fileRef.current);
      setPreview({
        status: "done",
        created: data.created ?? 0,
        updated: data.updated ?? 0,
      });
    } catch (error) {
      setPreview({
        status: "failed",
        message:
          error instanceof Error
            ? error.message
            : "Network error during import",
      });
    }
  }, [parsedRows]);

  const reset = () => {
    setPreview({ status: "idle" });
    setParsedRows([]);
    fileRef.current = null;
  };

  const downloadExport = async (type: "products" | "orders") => {
    setExportError("");
    setExporting(type);
    try {
      const { blob, filename } = await downloadAdminExport(type);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : "Unable to download the export.",
      );
    } finally {
      setExporting(null);
    }
  };

  return (
    <main className="admin">
      <AdminNav />
      <div>
        <p className="eyebrow">CATALOG MANAGEMENT</p>
        <h1 className="text-2xl font-bold tracking-tight">
          CSV Import &amp; Export
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Bulk-manage products via CSV import, or export products and orders for
          reporting.
        </p>
      </div>
      <CatalogTabs />

      {/* Export section */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold">Export data</h2>
        <p className="mt-1 text-sm text-gray-500">
          Download a full CSV snapshot. Exports stream directly and do not load
          into memory.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            id="export-products-btn"
            onClick={() => downloadExport("products")}
            disabled={exporting !== null}
          >
            {exporting === "products" ? "Preparing…" : "↓ Products CSV"}
          </Button>
          <Button
            id="export-orders-btn"
            onClick={() => downloadExport("orders")}
            variant="outline"
            disabled={exporting !== null}
          >
            {exporting === "orders" ? "Preparing…" : "↓ Orders CSV"}
          </Button>
        </div>
        {exportError && (
          <Alert variant="destructive" className="mt-3">
            <AlertDescription>{exportError}</AlertDescription>
          </Alert>
        )}
        <p className="mt-3 text-xs text-gray-400">
          Tip: the exported products CSV can be re-imported cleanly without
          format conversion.
        </p>
      </section>

      {/* Import section */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold">Import products</h2>
        <p className="mt-1 text-sm text-gray-500">
          Required columns:{" "}
          <code className="rounded bg-gray-100 px-1">handle</code>,{" "}
          <code className="rounded bg-gray-100 px-1">sku</code>,{" "}
          <code className="rounded bg-gray-100 px-1">title</code>,{" "}
          <code className="rounded bg-gray-100 px-1">price_cents</code>.
          Optional:{" "}
          <code className="rounded bg-gray-100 px-1">variant_title</code>,{" "}
          <code className="rounded bg-gray-100 px-1">description</code>,{" "}
          <code className="rounded bg-gray-100 px-1">is_available</code>,{" "}
          <code className="rounded bg-gray-100 px-1">is_published</code>,{" "}
          <code>option_values</code> (color:red|size:m), and{" "}
          <code>collection_handles</code> (summer|gifts). Max 5 MB. Existing
          attribute values and collections must already exist. Memberships are
          added; removing them uses the collection editor. Files import in
          atomic batches of at most 100 rows, keeping each product together.
          After a partial failure, retrying the same file preserves existing SKU
          identities.
        </p>

        {preview.status === "idle" && (
          <div className="mt-4">
            <label
              htmlFor="csv-file-input"
              className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center transition hover:border-gray-400 hover:bg-gray-100"
            >
              <span className="text-3xl">📄</span>
              <span className="mt-2 text-sm font-medium text-gray-700">
                Click to select a CSV file
              </span>
              <span className="text-xs text-gray-400">or drag and drop</span>
              <Input
                id="csv-file-input"
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={handleFileChange}
              />
            </label>
          </div>
        )}

        {preview.status === "parsing" && (
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
            <span className="animate-spin">⟳</span> Parsing file…
          </div>
        )}

        {preview.status === "errors" && (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-medium text-red-700">
                {preview.errors.length} validation error
                {preview.errors.length !== 1 ? "s" : ""} found — fix and
                re-upload.
              </p>
              <ul className="mt-2 space-y-1 text-xs text-red-600">
                {preview.errors.slice(0, 20).map((e, i) => (
                  <li key={i}>
                    Line {e.line}, <strong>{e.field}</strong>: {e.message}
                  </li>
                ))}
                {preview.errors.length > 20 && (
                  <li>…and {preview.errors.length - 20} more</li>
                )}
              </ul>
            </div>
            <Button onClick={reset} variant="link">
              Choose a different file
            </Button>
          </div>
        )}

        {preview.status === "ready" && (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
              ✓ {preview.rows.length} rows validated successfully
            </div>

            {/* Visual diff preview */}
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <Table className="text-xs">
                <TableHeader className="bg-muted text-left text-muted-foreground">
                  <TableRow>
                    <TableHead>Handle</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Variant</TableHead>
                    <TableHead>Options</TableHead>
                    <TableHead>Collections to add</TableHead>
                    <TableHead className="text-right">Price (cents)</TableHead>
                    <TableHead className="text-center">Available</TableHead>
                    <TableHead className="text-center">Published</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.slice(0, 50).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono">{row.handle}</TableCell>
                      <TableCell className="font-mono">{row.sku}</TableCell>
                      <TableCell>{row.productTitle}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.variantTitle}
                      </TableCell>
                      <TableCell>
                        {Object.entries(row.optionValues || {})
                          .map(([axis, value]) => `${axis}:${value}`)
                          .join(" · ") || "—"}
                      </TableCell>
                      <TableCell>
                        {row.collectionHandles?.join(", ") || "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.priceCents}
                      </TableCell>
                      <TableCell className="text-center">
                        {row.isAvailable ? "✓" : "✗"}
                      </TableCell>
                      <TableCell className="text-center">
                        {row.isPublished ? "✓" : "✗"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {preview.rows.length > 50 && (
                <p className="px-3 py-2 text-xs text-gray-400">
                  Showing first 50 of {preview.rows.length} rows
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <Button id="confirm-import-btn" onClick={handleImport}>
                Import {preview.rows.length} rows
              </Button>
              <Button onClick={reset} variant="link">
                Cancel
              </Button>
            </div>
          </div>
        )}

        {preview.status === "importing" && (
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
            <span className="animate-spin">⟳</span> Importing — this runs in a
            bounded product batches…
          </div>
        )}

        {preview.status === "done" && (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
              ✓ Import complete — {preview.created} created, {preview.updated}{" "}
              updated
            </div>
            <Button onClick={reset} variant="link">
              Import another file
            </Button>
          </div>
        )}

        {preview.status === "failed" && (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              ✗ {preview.message}
            </div>
            <Button onClick={reset} variant="link">
              Try again
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
