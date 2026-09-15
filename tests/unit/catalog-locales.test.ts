import { describe, expect, it } from "vitest";
import { translationLocales } from "@/domain/catalog-locales";

describe("catalog translation locales", () => {
  it("offers English when the catalog source language is Chinese", () => {
    expect(translationLocales("zh")).toEqual(["en"]);
  });

  it("offers Chinese when the catalog source language is English", () => {
    expect(translationLocales("en")).toEqual(["zh"]);
  });
});
