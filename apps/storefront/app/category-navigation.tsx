import type { CustomerPageModels } from "@supastore/contracts";
import { catalogHref, type CatalogNavigation } from "../lib/catalog-navigation";

type Group = CustomerPageModels["catalog"]["groups"][number];
type Branch = { group: Group; children: Branch[] };

export function CategoryNavigation({
  groups,
  locale,
  query,
}: {
  groups: Group[];
  locale: string;
  query: CatalogNavigation;
}) {
  const roots: Branch[] = [];
  const stack: Branch[] = [];
  for (const group of groups) {
    const depth = group.depth ?? (group.parentId ? 1 : 0);
    while (stack.length > depth) stack.pop();
    const branch: Branch = { group, children: [] };
    const parent = stack.at(-1);
    (parent?.children ?? roots).push(branch);
    stack.push(branch);
  }
  const render = (branches: Branch[], nested = false) => (
    <ul className={nested ? "category-children" : "category-families"}>
      {branches.map(({ group, children }) => (
        <li key={group.id}>
          <a
            className={
              "rounded-full border px-3 py-1.5 no-underline transition-colors " +
              (query.category === group.slug
                ? "border-primary bg-primary text-primary-foreground"
                : "border-transparent hover:border-border hover:bg-muted")
            }
            href={catalogHref(locale, query, { category: group.slug })}
            aria-current={query.category === group.slug ? "page" : undefined}
          >
            {group.name}
          </a>
          {children.length > 0 && render(children, true)}
        </li>
      ))}
    </ul>
  );
  return render(roots);
}
