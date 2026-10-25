import { beforeEach, expect, it, vi } from "vitest";
import Page from "../app/[locale]/page";
const state = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: state.redirect }));
vi.mock("../app/catalog", () => ({ default: () => null }));
beforeEach(() => state.redirect.mockReset());
it("keeps campaign-only links on the homepage", async () => {
  await Page({
    params: Promise.resolve({ locale: "en" }),
    searchParams: Promise.resolve({
      q: "",
      utm_source: "newsletter",
      gclid: "campaign",
    }),
  });
  expect(state.redirect).not.toHaveBeenCalled();
});
it("moves recognized catalog state to the products page", async () => {
  await Page({
    params: Promise.resolve({ locale: "zh" }),
    searchParams: Promise.resolve({
      q: "cup",
      category: "home",
      collection: "edit",
      options: ["color:blue"],
      page: "2",
    }),
  });
  expect(state.redirect).toHaveBeenCalledWith(
    "/zh/search?q=cup&category=home&collection=edit&page=2&options=color%3Ablue",
  );
});
