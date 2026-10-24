"use client";

import { useEffect, useState } from "react";
import { NativeSelect } from "@supastore/ui/native-select";
import { Button } from "@supastore/ui/button";
import { textFor } from "@supastore/i18n/messages";
import { type CatalogNavigation } from "../lib/catalog-navigation";

export function CatalogSort({
  locale,
  query,
}: {
  locale: string;
  query: CatalogNavigation;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const t = textFor(locale).ui;
  const options = Array.isArray(query.options)
    ? query.options
    : [query.options || ""];
  return (
    <form action={`/${locale}/search`} className="catalog-sort-form">
      {query.q && <input type="hidden" name="q" value={query.q} />}
      {query.category && (
        <input type="hidden" name="category" value={query.category} />
      )}
      {options.filter(Boolean).map((option) => (
        <input key={option} type="hidden" name="options" value={option} />
      ))}
      <label className="catalog-sort-enhanced grid gap-2 text-sm">
        {t.sort}
        <NativeSelect
          disabled={!ready}
          name="sort"
          defaultValue={query.sort || "newest"}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
        >
          <option value="newest">{t.newest}</option>
          <option value="price-low">{t.priceLowToHigh}</option>
          <option value="price-high">{t.priceHighToLow}</option>
        </NativeSelect>
      </label>
      <noscript>
        <style>{`.catalog-sort-enhanced { display: none; }`}</style>
        <label>
          {t.sort}
          <NativeSelect name="sort" defaultValue={query.sort || "newest"}>
            <option value="newest">{t.newest}</option>
            <option value="price-low">{t.priceLowToHigh}</option>
            <option value="price-high">{t.priceHighToLow}</option>
          </NativeSelect>
        </label>
        <Button type="submit">{textFor(locale).ui.applySort}</Button>
      </noscript>
    </form>
  );
}
