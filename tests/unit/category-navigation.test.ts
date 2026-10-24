import { describe, expect, it } from "vitest";
import { categoryNavigation } from "../../apps/backend/src/domain/catalog/category-navigation";

const category = (
  id: string,
  parentId: string | null,
  sortOrder: number,
  slug = id,
) => ({ id, parentId, sortOrder, slug });

describe("category navigation", () => {
  it("orders siblings and keeps each complete subtree before the next parent", () => {
    expect(
      categoryNavigation([
        category("b", null, 20),
        category("b-child", "b", 0),
        category("a-child2", "a", 20),
        category("a", null, 10),
        category("grandchild", "a-child1", 0),
        category("a-child1", "a", 10),
      ]).map((item) => [item.id, item.depth]),
    ).toEqual([
      ["a", 0],
      ["a-child1", 1],
      ["grandchild", 2],
      ["a-child2", 1],
      ["b", 0],
      ["b-child", 1],
    ]);
  });
  it("uses handles for ties, independently of translated names and incoming order", () => {
    const input = [
      category("b", null, 0, "zebra"),
      category("a", null, 0, "apple"),
    ];
    expect(categoryNavigation(input).map((item) => item.id)).toEqual([
      "a",
      "b",
    ]);
    expect(input.map((item) => item.id)).toEqual(["b", "a"]);
  });
  it("keeps missing parents and legacy cycles reachable without duplicating nodes", () => {
    const result = categoryNavigation([
      category("orphan", "missing", 0),
      category("a", "b", 1),
      category("b", "a", 2),
    ]);
    expect(new Set(result.map((item) => item.id)).size).toBe(3);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ id: "orphan", depth: 0 });
  });
  it("handles a deep tree without recursive traversal", () => {
    const result = categoryNavigation(
      Array.from({ length: 1000 }, (_, i) =>
        category(String(i), i ? String(i - 1) : null, 0),
      ),
    );
    expect(result.at(-1)?.depth).toBe(999);
  });
});
