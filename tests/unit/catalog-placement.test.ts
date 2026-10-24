import { describe, expect, it } from "vitest";
import { moveCatalogItem } from "@/domain/catalog/catalog-placement";

describe("catalog placement", () => {
  const rows = [
    { id: "a", position: 0 },
    { id: "b", position: 0 },
    { id: "c", position: null },
  ];
  it("moves across tied and automatic positions deterministically", () => {
    expect(moveCatalogItem(rows, "b", "up")).toEqual([
      { id: "b", position: 0 },
      { id: "a", position: 1 },
      { id: "c", position: 2 },
    ]);
    expect(moveCatalogItem(rows, "a", "down").map((row) => row.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(moveCatalogItem(rows, "c", "top").map((row) => row.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });
  it("does not rewrite positions for a move beyond an edge", () => {
    expect(moveCatalogItem(rows, "a", "up")).toEqual(rows);
    expect(moveCatalogItem(rows, "c", "down")).toEqual(rows);
    expect(moveCatalogItem(rows, "missing", "top")).toEqual(rows);
  });
});
