"use client";
import {
  boundedJson,
  deadlineFetch as fetch,
} from "@/infrastructure/http/bounded-json";
import { useEffect, useId, useRef, useState } from "react";
import { parseVariantOptionsDto } from "@supastore/contracts";
import { Input } from "@supastore/ui/input";
import { Button } from "@supastore/ui/button";
import { NativeSelect } from "@supastore/ui/native-select";

type Option = { id: string; label: string };
export function VariantPicker({
  name,
  label,
  initialOptions,
  scope = "sale",
}: {
  name: string;
  label: string;
  initialOptions: Option[];
  scope?: "sale" | "quota";
}) {
  const id = useId();
  const [options, setOptions] = useState(initialOptions);
  const [selected, setSelected] = useState<Option | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const active = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
    },
    [],
  );
  async function search() {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const deadline = setTimeout(() => controller.abort(), 15000);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/catalog/variants?scope=${scope}&q=${encodeURIComponent(query)}`,
        { signal: controller.signal },
      );
      if (!response.ok) throw new Error("Search failed");
      const payload: unknown = await boundedJson(response);
      if (!payload || typeof payload !== "object" || !("data" in payload))
        throw new Error("Invalid response");
      const result = parseVariantOptionsDto(payload.data);
      if (active.current !== controller) return;
      setOptions(result.options);
      setMessage(
        result.hasNext
          ? "Showing 50 matches. Refine your search for more."
          : result.options.length
            ? ""
            : "No variants match your search.",
      );
    } catch {
      if (active.current === controller)
        setMessage("Unable to search variants. Please try again.");
    } finally {
      clearTimeout(deadline);
      if (active.current === controller) setBusy(false);
    }
  }
  const visible =
    selected && !options.some((option) => option.id === selected.id)
      ? [selected, ...options]
      : options;
  return (
    <div className="grid gap-2">
      <label htmlFor={`${id}-search`}>Search variants</label>
      <div className="flex gap-2">
        <Input
          id={`${id}-search`}
          type="search"
          maxLength={120}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (!busy) void search();
            }
          }}
          placeholder="SKU or product name"
        />
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={search}
        >
          Search
        </Button>
      </div>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      <label htmlFor={`${id}-variant`}>{label}</label>
      <NativeSelect
        id={`${id}-variant`}
        name={name}
        required
        value={selected?.id || ""}
        onChange={(event) =>
          setSelected(
            visible.find((option) => option.id === event.target.value) || null,
          )
        }
      >
        <option value="">Choose variant</option>
        {visible.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
