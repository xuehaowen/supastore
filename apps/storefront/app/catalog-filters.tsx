"use client";
import { textFor } from "@supastore/i18n/messages";

import { useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import dynamic from "next/dynamic";
const StorefrontSheet = dynamic(() => import("./storefront-sheet"), {
  ssr: false,
});
import { NativeSelect } from "@supastore/ui/native-select";
import { Button } from "@supastore/ui/button";
import { designCopy } from "../lib/design-copy";
import { catalogHref } from "../lib/catalog-navigation";

type Facet = { attribute: string; name: string; value: string; label: string };
export function CatalogFilters({
  locale,
  facets,
  selected,
  query,
  sort,
  category,
}: {
  locale: string;
  facets: Facet[];
  selected: string[];
  query: string;
  sort: string;
  category: string;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const m = designCopy(locale);
  const axes = [...new Set(facets.map((f) => f.attribute))].slice(0, 4);
  if (!axes.length) return null;
  const fields = (prefix: string) => (
    <>
      <input type="hidden" name="q" value={query} />
      <input type="hidden" name="sort" value={sort} />
      <input type="hidden" name="category" value={category} />
      {axes.map((axis) => (
        <label className="grid gap-2" key={axis} htmlFor={`${prefix}-${axis}`}>
          {facets.find((f) => f.attribute === axis)!.name}
          <NativeSelect
            id={`${prefix}-${axis}`}
            name="options"
            defaultValue={selected.find((v) => v.startsWith(`${axis}:`)) || ""}
          >
            <option value="">{textFor(locale).all}</option>
            {facets
              .filter((f) => f.attribute === axis)
              .map((f) => (
                <option key={f.value} value={`${axis}:${f.value}`}>
                  {f.label}
                </option>
              ))}
          </NativeSelect>
        </label>
      ))}
      <Button type="submit">{m.apply}</Button>
      <a
        className="text-sm underline"
        href={catalogHref(locale, { q: query, category, sort })}
      >
        {m.clear}
      </a>
    </>
  );
  return (
    <>
      <form
        action={`/${locale}/search`}
        className="catalog-desktop-filters"
        aria-label={m.filters}
      >
        {fields("desktop")}
      </form>
      <div className="catalog-mobile-filters">
        <Button
          ref={trigger}
          variant="outline"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => {
            setLoaded(true);
            setOpen(true);
          }}
        >
          <SlidersHorizontal />
          {m.filters}
          {selected.length ? ` (${selected.length})` : ""}
        </Button>
        {loaded && (
          <StorefrontSheet
            open={open}
            onOpenChange={setOpen}
            triggerRef={trigger}
            title={m.filters}
            description={m.apply}
            closeLabel={m.close}
          >
            <form action={`/${locale}/search`} className="grid gap-6">
              {fields("mobile")}
            </form>
          </StorefrontSheet>
        )}
      </div>
    </>
  );
}
