import { CatalogPlacement } from "./catalog-placement";

export function NavigationOrder({
  kind,
  id,
  name,
  position,
  pinned = false,
  search,
  page,
}: {
  kind: "category" | "collection";
  id: string;
  name: string;
  position: number;
  pinned?: boolean;
  search: string;
  page: number;
}) {
  return (
    <CatalogPlacement
      kind={kind}
      id={id}
      name={name}
      position={position}
      pinned={pinned}
      context={{ q: search, page: String(page) }}
    />
  );
}
