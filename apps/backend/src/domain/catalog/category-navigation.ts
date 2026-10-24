type Category = {
  id: string;
  parentId: string | null;
  sortOrder: number;
  slug: string;
};

/** Order siblings first, then walk each parent's entire subtree. */
export function categoryNavigation<T extends Category>(
  categories: T[],
): (T & { depth: number })[] {
  const ordered = [...categories].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0) ||
      a.id.localeCompare(b.id),
  );
  const ids = new Set(ordered.map((item) => item.id));
  const children = new Map<string | null, T[]>();
  for (const item of ordered) {
    const parent =
      item.parentId && ids.has(item.parentId) ? item.parentId : null;
    const siblings = children.get(parent) ?? [];
    siblings.push(item);
    children.set(parent, siblings);
  }
  const result: (T & { depth: number })[] = [];
  const visited = new Set<string>();
  function walk(start: T, depth: number) {
    const stack = [{ item: start, depth }];
    while (stack.length) {
      const current = stack.pop()!;
      if (visited.has(current.item.id)) continue;
      visited.add(current.item.id);
      result.push({ ...current.item, depth: current.depth });
      const descendants = children.get(current.item.id) ?? [];
      for (let i = descendants.length - 1; i >= 0; i--)
        stack.push({ item: descendants[i]!, depth: current.depth + 1 });
    }
  }
  for (const root of children.get(null) ?? []) walk(root, 0);
  // Keep malformed legacy cycles reachable without looping.
  for (const item of ordered) if (!visited.has(item.id)) walk(item, 0);
  return result;
}
