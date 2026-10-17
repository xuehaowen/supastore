import { afterEach, expect, it, vi } from "vitest";
import { publicPageMetadata, policyPresentation } from "./page-metadata";
import { store } from "../../../tests/fixtures/customer-pages";
import { alternateLinks, publicOrigin, safeJsonLd } from "./seo";
import robots from "../app/robots";
it("allows crawling public product assets while keeping private API routes disallowed", () => {
  expect(robots()).toMatchObject({ rules: { allow: ["/", "/api/assets"], disallow: expect.arrayContaining(["/api/", "/en/orders/"]) } });
});
afterEach(() => vi.unstubAllEnvs());

it("brands public metadata and preserves paginated HTTPS canonicals and alternates", () => {
  vi.stubEnv("STOREFRONT_ORIGIN", "https://bakery.example");
  expect(
    publicPageMetadata({
      locale: "zh",
      path: "/collections/morning",
      title: "早晨麵包",
      storeName: "Milky Bakery",
      description: "  Fresh\n bread  ",
      page: 2,
    }),
  ).toMatchObject({
    title: { absolute: "早晨麵包 | Milky Bakery" },
    description: "Fresh bread",
    alternates: {
      canonical: "https://bakery.example/zh/collections/morning?page=2",
      languages: {
        en: "https://bakery.example/en/collections/morning?page=2",
        zh: "https://bakery.example/zh/collections/morning?page=2",
        "x-default": "https://bakery.example/en/collections/morning?page=2",
      },
    },
  });
});
it("does not double the home brand or invent public business facts", () => {
  expect(
    publicPageMetadata({
      locale: "en",
      path: "",
      title: "Milky Bakery",
      storeName: "Milky Bakery",
    }).title,
  ).toEqual({ absolute: "Milky Bakery" });
  expect(safeJsonLd({ name: "</script><script>bad</script>" })).not.toContain(
    "<",
  );
});
it("matches visible policy fallback and links only locales that resolve", () => {
  const localized = { ...store, publicContent: { zh: { about: "手作麵包" } } };
  expect(policyPresentation(localized, "zh", "about")).toMatchObject({
    content: "手作麵包",
    locales: ["zh"],
  });
  expect(policyPresentation(localized, "en", "about")).toBeNull();
  expect(policyPresentation(store, "zh", "about")).toMatchObject({
    content: "A test store",
    locales: ["en", "zh"],
  });
  expect(policyPresentation(store, "en", "toString")).toBeNull();
  expect(alternateLinks("/pages/about", ["zh"])).toEqual({
    zh: expect.stringContaining("/zh/pages/about"),
    "x-default": expect.stringContaining("/zh/pages/about"),
  });
});
it.each(["javascript:alert(1)", "https://secret:password@bakery.example"])(
  "rejects invalid public origin %s",
  (origin) => {
    vi.stubEnv("STOREFRONT_ORIGIN", origin);
    expect(() => publicOrigin()).toThrow();
  },
);
