export type GenerationOption = {
  id: string;
  code: string;
  name: string;
  values: { id: string; code: string; label: string }[];
};
export type GeneratedCombination = {
  key: string;
  sku: string;
  title: string;
  attributes: Record<string, string>;
  assignments: { attributeId: string; valueId: string }[];
};

// Check the size before expanding. Keys depend on identities, never labels or locale.
export function buildVariantCombinations(
  options: GenerationOption[],
  prefix: string,
  limit = 50,
): GeneratedCombination[] {
  if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(prefix) || prefix.length > 80)
    throw new Error(
      "SKU prefix must use uppercase letters, numbers, and hyphens (up to 80 characters).",
    );
  if (!options.length || options.length > 4)
    throw new Error("Choose between one and four options.");
  if (new Set(options.map((o) => o.id)).size !== options.length)
    throw new Error("An option can only be selected once.");
  let count = 1;
  for (const option of options) {
    if (!option.values.length)
      throw new Error(`Choose at least one value for ${option.name}.`);
    if (new Set(option.values.map((v) => v.id)).size !== option.values.length)
      throw new Error("Duplicate option values.");
    count *= option.values.length;
    if (count > limit)
      throw new Error(
        `These options exceed the ${limit}-variant limit. Reduce the values before generating.`,
      );
  }
  let combinations: GeneratedCombination[] = [
    { key: "", sku: prefix, title: "", attributes: {}, assignments: [] },
  ];
  for (const option of options)
    combinations = combinations.flatMap((current) =>
      option.values.map((value) => ({
        key: "",
        sku: `${current.sku}-${option.code.toUpperCase()}-${value.code.toUpperCase()}`,
        title: [current.title, value.label].filter(Boolean).join(" / "),
        attributes: { ...current.attributes, [option.code]: value.code },
        assignments: [
          ...current.assignments,
          { attributeId: option.id, valueId: value.id },
        ],
      })),
    );
  for (const combination of combinations) {
    combination.key = combination.assignments
      .map((a) => `${a.attributeId}:${a.valueId}`)
      .sort()
      .join("|");
    if (combination.sku.length > 200 || combination.title.length > 200)
      throw new Error(
        "Generated SKU or title is too long. Shorten the codes or labels.",
      );
  }
  if (new Set(combinations.map((c) => c.sku)).size !== combinations.length)
    throw new Error("Option codes produce duplicate SKUs. Change the codes.");
  return combinations;
}
