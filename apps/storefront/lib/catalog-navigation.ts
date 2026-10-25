export type CatalogNavigation = {
  q?: string;
  category?: string;
  collection?: string;
  collectionPage?: boolean;
  sort?: string;
  options?: string | string[];
  page?: string;
};

/** Changing a filter starts at page one without losing the rest of the search. */
export function catalogHref(
  locale: string,
  current: CatalogNavigation,
  changes: Partial<CatalogNavigation> = {},
) {
  const state = { ...current, ...changes };
  const params = new URLSearchParams();
  for (const key of ["q", "category", "sort", "collection"] as const)
    if (key !== "collection" || !state.collectionPage)
      if (state[key]) params.set(key, state[key]);
  const options = Array.isArray(state.options)
    ? state.options
    : [state.options];
  options
    .filter((value): value is string => !!value)
    .forEach((value) => params.append("options", value));
  return `${catalogPath(locale, state)}${params.size ? `?${params}` : ""}`;
}

export function catalogPath(locale: string, state: CatalogNavigation) {
  return state.collectionPage && state.collection
    ? `/${locale}/collections/${encodeURIComponent(state.collection)}`
    : `/${locale}/search`;
}
