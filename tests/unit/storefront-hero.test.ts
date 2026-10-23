import { describe, expect, it } from "vitest";
import * as v from "valibot";
import {
  localizedStorefrontHero,
  storefrontHeroSchema,
} from "../../packages/contracts/src/storefront-hero";

describe("storefront hero", () => {
  it("accepts crop and bounded unique merchandising selections without changing old settings", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(
      v.safeParse(storefrontHeroSchema, {
        imageKey: null,
        imagePosition: "top",
        featuredProductIds: [id],
        featuredCollectionIds: [id],
      }).success,
    ).toBe(true);
    for (const extra of [
      { imagePosition: "left" },
      { featuredProductIds: [id, id] },
      { featuredCollectionIds: [id, id, id, id] },
      { featuredProductIds: ["not-a-uuid"] },
    ])
      expect(
        v.safeParse(storefrontHeroSchema, { imageKey: null, ...extra }).success,
      ).toBe(false);
  });
  it("accepts existing stores without campaign content", () => {
    expect(v.parse(storefrontHeroSchema, null)).toBeNull();
    expect(localizedStorefrontHero(undefined, "zh")).toBeNull();
  });
  it("resolves blank translations per field using the store default locale", () => {
    expect(
      localizedStorefrontHero(
        {
          imageKey: "catalog/cup.jpg",
          en: {
            heading: "Everyday objects",
            body: "Useful things",
            imageAlt: "Cup",
          },
          zh: { heading: "日常好物", body: "", imageAlt: "" },
        },
        "zh",
        "en",
      ),
    ).toEqual({
      imageKey: "catalog/cup.jpg",
      heading: "日常好物",
      body: "Useful things",
      imageAlt: "Cup",
    });
  });
  it("supports text-only heroes and trims merchant copy", () => {
    expect(
      v.parse(storefrontHeroSchema, {
        imageKey: null,
        en: { heading: " Shop ", body: "", imageAlt: "" },
      })?.en?.heading,
    ).toBe("Shop");
  });
  for (const [field, max] of [
    ["heading", 120],
    ["body", 300],
    ["imageAlt", 180],
  ] as const) {
    it(`rejects oversized ${field}`, () => {
      expect(
        v.safeParse(storefrontHeroSchema, {
          imageKey: null,
          en: {
            heading: "",
            body: "",
            imageAlt: "",
            [field]: "x".repeat(max + 1),
          },
        }).success,
      ).toBe(false);
    });
  }
});
