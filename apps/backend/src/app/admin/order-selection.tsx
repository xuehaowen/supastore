"use client";

import type { OrderFilters } from "@/domain/catalog/order-filters";
import { createContext, useContext, useState, type ReactNode } from "react";
import { Checkbox } from "@supastore/ui/checkbox";
import { Button } from "@supastore/ui/button";
import { NativeSelect } from "@supastore/ui/native-select";
import { downloadAdminExport } from "@/app/client-requests";

const SelectionContext = createContext<{
  selected: string[];
  setSelected: (ids: string[]) => void;
  pageIds: string[];
} | null>(null);

function useSelection() {
  const context = useContext(SelectionContext);
  if (!context) throw new Error("Order selection requires a provider.");
  return context;
}

export function OrderSelection({
  pageIds,
  children,
}: {
  pageIds: string[];
  children: ReactNode;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <SelectionContext.Provider value={{ selected, setSelected, pageIds }}>
      {children}
    </SelectionContext.Provider>
  );
}

export function OrderSelectionCheckbox({
  id,
  label,
}: {
  id?: string;
  label?: string;
}) {
  const { selected, setSelected, pageIds } = useSelection();
  return (
    <Checkbox
      aria-label={
        id ? `Select order ${label}` : "Select all orders on this page"
      }
      ref={(element) => {
        if (element)
          element.indeterminate =
            !id && selected.length > 0 && selected.length < pageIds.length;
      }}
      checked={
        id
          ? selected.includes(id)
          : pageIds.length > 0 && selected.length === pageIds.length
      }
      disabled={!id && !pageIds.length}
      onChange={(event) =>
        setSelected(
          id
            ? event.target.checked
              ? [...new Set([...selected, id])]
              : selected.filter((value) => value !== id)
            : event.target.checked
              ? pageIds
              : [],
        )
      }
    />
  );
}

export function OrderExportToolbar({
  search,
  status,
  filters = {},
}: {
  search: string;
  status: string;
  filters?: OrderFilters;
}) {
  const { selected, setSelected, pageIds } = useSelection();
  const [scope, setScope] = useState("selected");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function download(format: "csv" | "xlsx") {
    setPending(true);
    setError("");
    try {
      const parameters = new URLSearchParams({
        scope: scope === "page" ? "selected" : scope,
        format,
      });
      for (const key of ["sort", "direction"] as const)
        if (filters[key]) parameters.set(key, filters[key]);
      if (scope === "selected" || scope === "page")
        parameters.set(
          "ids",
          (scope === "page" ? pageIds : selected).join(","),
        );
      if (scope === "filtered") {
        for (const [key, value] of Object.entries(filters))
          if (value) parameters.set(key, value);
        parameters.set("q", search);
        parameters.set("status", status);
      }
      const file = await downloadAdminExport("orders", parameters);
      const url = URL.createObjectURL(file.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Unable to export orders.",
      );
    } finally {
      setPending(false);
    }
  }
  const disabled =
    pending ||
    (scope === "selected" && !selected.length) ||
    (scope === "page" && !pageIds.length);
  return (
    <div className="order-export-toolbar">
      <span role="status">{selected.length} orders selected</span>
      {selected.length > 0 && (
        <Button type="button" variant="ghost" onClick={() => setSelected([])}>
          Clear selection
        </Button>
      )}
      <label>
        Orders to export
        <NativeSelect
          value={scope}
          onChange={(event) => setScope(event.target.value)}
          disabled={pending}
        >
          <option value="selected">Selected orders ({selected.length})</option>
          <option value="page">Current page ({pageIds.length})</option>
          <option value="filtered">All orders matching current filters</option>
          <option value="all">All orders</option>
        </NativeSelect>
      </label>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => download("csv")}
      >
        Export orders CSV
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => download("xlsx")}
      >
        Export orders XLSX
      </Button>
      {pending && <span role="status">Preparing export…</span>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
