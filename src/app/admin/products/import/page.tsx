"use client";

import { useRef, useState, useCallback } from "react";

interface CsvParseError {
  line: number;
  field: string;
  message: string;
}

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
  const [parsedRows, setParsedRows] = useState<ProductCsvRow[]>([]);
  const fileRef = useRef<File | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    fileRef.current = file;
    setPreview({ status: "parsing" });
    setParsedRows([]);

    // Use Web Worker for off-main-thread parsing
    const worker = new Worker(new URL("./csv-parser.worker.ts", import.meta.url));
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
      const { rows, errors } = ev.data as { rows: ProductCsvRow[]; errors: CsvParseError[] };
      if (errors.length > 0) {
        setPreview({ status: "errors", errors });
      } else {
        setParsedRows(rows);
        setPreview({ status: "ready", rows });
      }
    };

    worker.onerror = () => {
      setPreview({ status: "failed", message: "Web Worker error during parse" });
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const handleImport = useCallback(async () => {
    if (!fileRef.current || parsedRows.length === 0) return;
    setPreview({ status: "importing" });

    const formData = new FormData();
    formData.append("file", fileRef.current);

    try {
      const res = await fetch("/api/admin/imports/products", {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as {
        success: boolean;
        created?: number;
        updated?: number;
        error?: string;
        errors?: CsvParseError[];
      };

      if (!res.ok || !data.success) {
        setPreview({
          status: "failed",
          message: data.error ?? data.errors?.map((e) => `Line ${e.line}: ${e.message}`).join("; ") ?? "Import failed",
        });
      } else {
        setPreview({ status: "done", created: data.created ?? 0, updated: data.updated ?? 0 });
      }
    } catch {
      setPreview({ status: "failed", message: "Network error during import" });
    }
  }, [parsedRows]);

  const reset = () => {
    setPreview({ status: "idle" });
    setParsedRows([]);
    fileRef.current = null;
  };

  const downloadExport = (type: "products" | "orders") => {
    window.location.href = `/api/admin/exports/${type}`;
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">CSV Import &amp; Export</h1>
        <p className="mt-1 text-sm text-gray-500">
          Bulk-manage products via CSV import, or export products and orders for reporting.
        </p>
      </div>

      {/* Export section */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold">Export data</h2>
        <p className="mt-1 text-sm text-gray-500">
          Download a full CSV snapshot. Exports stream directly and do not load into memory.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            id="export-products-btn"
            onClick={() => downloadExport("products")}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
          >
            ↓ Products CSV
          </button>
          <button
            id="export-orders-btn"
            onClick={() => downloadExport("orders")}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 transition-colors"
          >
            ↓ Orders CSV
          </button>
        </div>
        <p className="mt-3 text-xs text-gray-400">
          Tip: the exported products CSV can be re-imported cleanly without format conversion.
        </p>
      </section>

      {/* Import section */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold">Import products</h2>
        <p className="mt-1 text-sm text-gray-500">
          Required columns: <code className="rounded bg-gray-100 px-1">handle</code>,{" "}
          <code className="rounded bg-gray-100 px-1">sku</code>,{" "}
          <code className="rounded bg-gray-100 px-1">title</code>,{" "}
          <code className="rounded bg-gray-100 px-1">price_cents</code>. Optional:{" "}
          <code className="rounded bg-gray-100 px-1">variant_title</code>,{" "}
          <code className="rounded bg-gray-100 px-1">description</code>,{" "}
          <code className="rounded bg-gray-100 px-1">is_available</code>,{" "}
          <code className="rounded bg-gray-100 px-1">is_published</code>. Max 5 MB.
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
              <input
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
                {preview.errors.length} validation error{preview.errors.length !== 1 ? "s" : ""} found — fix and re-upload.
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
            <button onClick={reset} className="text-sm text-gray-500 underline hover:text-gray-700">
              Choose a different file
            </button>
          </div>
        )}

        {preview.status === "ready" && (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
              ✓ {preview.rows.length} rows validated successfully
            </div>

            {/* Visual diff preview */}
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 text-left text-gray-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Handle</th>
                    <th className="px-3 py-2 font-medium">SKU</th>
                    <th className="px-3 py-2 font-medium">Title</th>
                    <th className="px-3 py-2 font-medium">Variant</th>
                    <th className="px-3 py-2 font-medium text-right">Price (cents)</th>
                    <th className="px-3 py-2 font-medium text-center">Available</th>
                    <th className="px-3 py-2 font-medium text-center">Published</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.rows.slice(0, 50).map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-1.5 font-mono">{row.handle}</td>
                      <td className="px-3 py-1.5 font-mono">{row.sku}</td>
                      <td className="px-3 py-1.5">{row.productTitle}</td>
                      <td className="px-3 py-1.5 text-gray-500">{row.variantTitle}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{row.priceCents}</td>
                      <td className="px-3 py-1.5 text-center">{row.isAvailable ? "✓" : "✗"}</td>
                      <td className="px-3 py-1.5 text-center">{row.isPublished ? "✓" : "✗"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.rows.length > 50 && (
                <p className="px-3 py-2 text-xs text-gray-400">
                  Showing first 50 of {preview.rows.length} rows
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                id="confirm-import-btn"
                onClick={handleImport}
                className="rounded-lg bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
              >
                Import {preview.rows.length} rows
              </button>
              <button
                onClick={reset}
                className="text-sm text-gray-500 underline hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {preview.status === "importing" && (
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
            <span className="animate-spin">⟳</span> Importing — this runs in a single transaction…
          </div>
        )}

        {preview.status === "done" && (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
              ✓ Import complete — {preview.created} created, {preview.updated} updated
            </div>
            <button onClick={reset} className="text-sm text-gray-500 underline hover:text-gray-700">
              Import another file
            </button>
          </div>
        )}

        {preview.status === "failed" && (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              ✗ {preview.message}
            </div>
            <button onClick={reset} className="text-sm text-gray-500 underline hover:text-gray-700">
              Try again
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
