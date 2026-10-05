import { describe, expect, it } from "vitest";
import {
  buildVariantCombinations,
  type GenerationOption,
} from "@/domain/catalog/variant-combinations";
const options: GenerationOption[] = [
  {
    id: "color",
    code: "color",
    name: "Color",
    values: [
      { id: "red", code: "red", label: "Red" },
      { id: "blue", code: "blue", label: "Blue" },
    ],
  },
  {
    id: "size",
    code: "size",
    name: "Size",
    values: [
      { id: "small", code: "s", label: "Small" },
      { id: "large", code: "l", label: "Large" },
    ],
  },
];
describe("variant combination generation", () => {
  it("builds exact combinations and predictable SKUs", () => {
    const generated = buildVariantCombinations(options, "SHIRT");
    expect(generated).toHaveLength(4);
    expect(generated[0]).toEqual({
      key: "color:red|size:small",
      sku: "SHIRT-COLOR-RED-SIZE-S",
      title: "Red / Small",
      attributes: { color: "red", size: "s" },
      assignments: [
        { attributeId: "color", valueId: "red" },
        { attributeId: "size", valueId: "small" },
      ],
    });
  });
  it("keeps identity stable across reordered options and changed labels", () => {
    const original = buildVariantCombinations(options, "SHIRT")
      .map((c) => c.key)
      .sort();
    const translated = options
      .toReversed()
      .map((o) => ({
        ...o,
        values: o.values.map((v) => ({ ...v, label: `Translated ${v.label}` })),
      }));
    expect(
      buildVariantCombinations(translated, "SHIRT")
        .map((c) => c.key)
        .sort(),
    ).toEqual(original);
  });
  it("rejects oversized generation before materializing it", () => {
    const many = options.map((o) => ({
      ...o,
      values: Array.from({ length: 8 }, (_, i) => ({
        id: String(i),
        code: String(i),
        label: String(i),
      })),
    }));
    expect(() => buildVariantCombinations(many, "SHIRT")).toThrow(
      "50-variant limit",
    );
  });
  it("rejects empty options, duplicate identities, bad prefixes and ambiguous SKU codes", () => {
    expect(() => buildVariantCombinations([], "SHIRT")).toThrow("one and four");
    expect(() =>
      buildVariantCombinations([options[0]!, options[0]!], "SHIRT"),
    ).toThrow("only be selected once");
    expect(() => buildVariantCombinations(options, "shirt/")).toThrow(
      "SKU prefix",
    );
    const duplicate = {
      ...options[0]!,
      values: [
        { id: "a", code: "same", label: "A" },
        { id: "b", code: "same", label: "B" },
      ],
    };
    expect(() => buildVariantCombinations([duplicate], "SHIRT")).toThrow(
      "duplicate SKUs",
    );
  });
});
