/** Rows arrive in their current storefront order, within one pin group and scope. */
export function moveCatalogItem(
  rows: { id: string; position: number | null }[],
  id: string,
  operation: "up" | "down" | "top",
) {
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) return rows;
  const target =
    operation === "top" ? 0 : index + (operation === "up" ? -1 : 1);
  if (target < 0 || target >= rows.length || target === index) return rows;
  const next = [...rows];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved!);
  return next.map((row, position) => ({ ...row, position }));
}
