export type CatalogNavigation = {
  q?: string;
  category?: string;
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
  for (const key of ["q", "category", "sort"] as const)
    if (state[key]) params.set(key, state[key]);
  const options = Array.isArray(state.options)
    ? state.options
    : [state.options];
  options
    .filter((value): value is string => !!value)
    .forEach((value) => params.append("options", value));
  return `/${locale}/search${params.size ? `?${params}` : ""}`;
}
