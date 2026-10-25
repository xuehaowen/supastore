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
import { catalogHref, catalogPath } from "../lib/catalog-navigation";

type Facet = { attribute: string; name: string; value: string; label: string };
export function CatalogFilters({
  locale,
  facets,
  selected,
  query,
  sort,
  category,
  collection = "",
  collectionPage = false,
  collections = [],
  categories = [],
}: {
  locale: string;
  facets: Facet[];
  selected: string[];
  query: string;
  sort: string;
  category: string;
  collection?: string;
  collectionPage?: boolean;
  collections?: { handle: string; title: string }[];
  categories?: { slug: string; name: string; depth?: number }[];
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const m = designCopy(locale);
  const axes = [...new Set(facets.map((f) => f.attribute))].slice(0, 4);
  const state = { q: query, sort, category, collection, collectionPage };
  const count =
    selected.length +
    Number(!!category) +
    Number(!!collection && !collectionPage);
  const collectionSelector = !collectionPage && collections.length > 0;
  if (!axes.length && !collectionSelector && !categories.length) return null;
  const fields = (prefix: string) => (
    <>
      <input type="hidden" name="q" value={query} />
      <input type="hidden" name="sort" value={sort} />
      {!collectionPage && collections.length > 0 && (
        <label className="grid gap-2" htmlFor={`${prefix}-collection`}>
          {textFor(locale).ui.collectionFilter}
          <NativeSelect
            id={`${prefix}-collection`}
            name="collection"
            defaultValue={collection}
          >
            <option value="">{textFor(locale).ui.allCollections}</option>
            {collections.map((item) => (
              <option key={item.handle} value={item.handle}>
                {item.title}
              </option>
            ))}
          </NativeSelect>
        </label>
      )}
      {categories.length ? (
        <label className="grid gap-2" htmlFor={`${prefix}-category`}>
          {textFor(locale).ui.categoryFilter}
          <NativeSelect
            id={`${prefix}-category`}
            name="category"
            defaultValue={category}
          >
            <option value="">{textFor(locale).all}</option>
            {categories.map((item) => (
              <option
                key={item.slug}
                value={item.slug}
              >{`${"— ".repeat(item.depth ?? 0)}${item.name}`}</option>
            ))}
          </NativeSelect>
        </label>
      ) : (
        <input type="hidden" name="category" value={category} />
      )}
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
        href={catalogHref(locale, state, {
          category: "",
          collection: collectionPage ? collection : "",
          options: [],
        })}
      >
        {m.clear}
      </a>
    </>
  );
  return (
    <>
      <noscript>
        <style>{`@media (max-width: 767px) {
          .catalog-desktop-filters { display: flex; flex-wrap: wrap; gap: 16px; grid-column: 1 / -1; padding: 16px; }
          .catalog-desktop-filters label { flex: 1 1 120px; min-width: 0; }
          .catalog-mobile-filters { display: none; }
        }`}</style>
      </noscript>
      {(axes.length > 0 || collectionSelector || categories.length > 0) && (
        <form
          action={catalogPath(locale, state)}
          className="catalog-desktop-filters"
          aria-label={m.filters}
        >
          {fields("desktop")}
        </form>
      )}
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
          {count ? ` (${count})` : ""}
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
            <form action={catalogPath(locale, state)} className="grid gap-6">
              {fields("mobile")}
            </form>
          </StorefrontSheet>
        )}
      </div>
    </>
  );
}
