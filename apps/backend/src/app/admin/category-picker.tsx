"use client";
import { useContext, useEffect, useRef, useState } from "react";
import { CategoryDraftContext } from "./product-draft-form";
import { parseVariantOptionsDto } from "@supastore/contracts";
import { boundedJson, deadlineFetch } from "@/infrastructure/http/bounded-json";
import { Button } from "@supastore/ui/button";
import { Input } from "@supastore/ui/input";
import { Checkbox } from "@supastore/ui/checkbox";
import { NativeSelect } from "@supastore/ui/native-select";
type Option = { id: string; label: string };
const emptyOptions: Option[] = [];
export function CategoryPicker({
  name,
  label,
  options,
  selected = emptyOptions,
  multiple = true,
}: {
  name: string;
  label: string;
  options: Option[];
  selected?: Option[];
  multiple?: boolean;
}) {
  const [matches, setMatches] = useState(options),
    [chosen, setChosen] = useState(selected);
  const [query, setQuery] = useState(""),
    [message, setMessage] = useState("");
  const active = useRef<AbortController | null>(null);
  const draft = useContext(CategoryDraftContext);
  useEffect(() => {
    if (!draft || !multiple || name !== "categoryIds") return;
    const candidates = [...draft.options, ...selected, ...options];
    setChosen(
      draft.ids.flatMap((id) => {
        const option = candidates.find((candidate) => candidate.id === id);
        return option ? [option] : [];
      }),
    );
  }, [draft, multiple, name, options, selected]);
  useEffect(() => () => active.current?.abort(), []);
  async function search() {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    try {
      const response = await deadlineFetch(
        `/api/admin/catalog/categories?q=${encodeURIComponent(query)}`,
        { signal: controller.signal },
      );
      if (!response.ok) throw new Error("Search failed");
      const payload = await boundedJson(response);
      if (!payload || typeof payload !== "object" || !("data" in payload))
        throw new Error("Invalid response");
      const result = parseVariantOptionsDto(payload.data);
      if (active.current !== controller) return;
      setMatches(result.options);
      setMessage(
        result.hasNext
          ? "Showing 50 matches. Refine your search."
          : result.options.length
            ? ""
            : "No categories found.",
      );
    } catch {
      if (active.current === controller)
        setMessage("Unable to search categories. Please try again.");
    }
  }
  const visible = [
    ...chosen.filter((item) => !matches.some((match) => match.id === item.id)),
    ...matches,
  ];
  return (
    <fieldset className="grid gap-3">
      <legend>{label}</legend>
      <label>
        Search categories
        <Input
          type="search"
          maxLength={120}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void search();
            }
          }}
        />
      </label>
      <Button type="button" variant="outline" onClick={search}>
        Search categories
      </Button>
      {message && <p role="status">{message}</p>}
      {!multiple ? (
        <label>
          {label}
          <NativeSelect
            name={name}
            value={chosen[0]?.id || ""}
            onChange={(event) =>
              setChosen(
                visible.filter((item) => item.id === event.target.value),
              )
            }
          >
            <option value="">All categories</option>
            {visible.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </NativeSelect>
        </label>
      ) : (
        visible.map((item) => (
          <label className="check" key={item.id}>
            <Checkbox
              name={name}
              value={item.id}
              data-category-label={item.label}
              checked={chosen.some((choice) => choice.id === item.id)}
              onChange={(event) =>
                setChosen((items) =>
                  event.target.checked
                    ? items.some((choice) => choice.id === item.id)
                      ? items
                      : [...items, item]
                    : items.filter((choice) => choice.id !== item.id),
                )
              }
            />
            {item.label}
          </label>
        ))
      )}
    </fieldset>
  );
}
