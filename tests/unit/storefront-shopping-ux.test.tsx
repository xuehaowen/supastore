import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { catalogHref } from "../../apps/storefront/lib/catalog-navigation";
import { catalogAvailability } from "../../apps/backend/src/domain/catalog/catalog-availability";
import { parseQuoteRequest } from "../../apps/backend/src/application/common/quote-request";
import { ShippingAddress } from "../../apps/storefront/app/shipping-address";

describe("catalog navigation", () => {
  const state = {
    q: "blue cup",
    category: "cups",
    collection: "summer",
    sort: "price-low",
    options: ["color:blue", "size:small"],
    page: "3",
  };
  it("keeps search, sort and options when switching categories, resetting pagination", () => {
    const url = new URL(
      catalogHref("en", state, { category: "gifts" }),
      "http://store.test",
    );
    expect(url.pathname).toBe("/en/search");
    expect(url.searchParams.get("q")).toBe("blue cup");
    expect(url.searchParams.get("category")).toBe("gifts");
    expect(url.searchParams.get("collection")).toBe("summer");
    expect(url.searchParams.get("sort")).toBe("price-low");
    expect(url.searchParams.getAll("options")).toEqual(state.options);
    expect(url.searchParams.has("page")).toBe(false);
  });
  it("can remove one option or clear filters while retaining search and sort", () => {
    const one = new URL(
      catalogHref("zh", state, { options: ["size:small"] }),
      "http://store.test",
    );
    expect(one.searchParams.getAll("options")).toEqual(["size:small"]);
    const clear = new URL(
      catalogHref("en", state, { category: "", options: [] }),
      "http://store.test",
    );
    expect(clear.searchParams.has("category")).toBe(false);
    expect(clear.searchParams.has("options")).toBe(false);
    expect(clear.searchParams.get("q")).toBe("blue cup");
    expect(clear.searchParams.get("sort")).toBe("price-low");
  });
  it("keeps collection pages scoped when switching categories and removing options", () => {
    const url = new URL(
      catalogHref(
        "zh",
        { ...state, collectionPage: true },
        { category: "gifts", options: [] },
      ),
      "http://store.test",
    );
    expect(url.pathname).toBe("/zh/collections/summer");
    expect(url.searchParams.get("category")).toBe("gifts");
    expect(url.searchParams.get("q")).toBe("blue cup");
    expect(url.searchParams.get("sort")).toBe("price-low");
    expect(url.searchParams.has("collection")).toBe(false);
    expect(url.searchParams.has("page")).toBe(false);
  });
  it("can remove the collection alone while retaining the rest of a mixed search", () => {
    const url = new URL(
      catalogHref("en", state, { collection: "" }),
      "http://store.test",
    );
    expect(url.pathname).toBe("/en/search");
    expect(url.searchParams.has("collection")).toBe(false);
    expect(url.searchParams.get("category")).toBe("cups");
    expect(url.searchParams.getAll("options")).toEqual(state.options);
  });
});

describe("catalog pricing and stock", () => {
  const variant = {
    priceCents: 1000,
    isAvailable: true,
    trackingEnabled: true,
    onHand: 4,
    reserved: 0,
  };
  it("prices available variants, excluding disabled and fully reserved options", () => {
    expect(
      catalogAvailability([
        variant,
        { ...variant, priceCents: 500, reserved: 4 },
        { ...variant, priceCents: 200, isAvailable: false },
        { ...variant, priceCents: 1500 },
      ]),
    ).toEqual({
      lowestPriceCents: 1000,
      highestPriceCents: 1500,
      isAvailable: true,
    });
  });
  it("treats untracked variants as available and missing variants as unavailable", () => {
    expect(
      catalogAvailability([
        { ...variant, trackingEnabled: null, onHand: null, reserved: null },
      ]).isAvailable,
    ).toBe(true);
    expect(catalogAvailability([])).toEqual({
      lowestPriceCents: null,
      highestPriceCents: null,
      isAvailable: false,
    });
    expect(catalogAvailability([{ ...variant, reserved: 4 }])).toEqual({
      lowestPriceCents: 1000,
      highestPriceCents: 1000,
      isAvailable: false,
    });
  });
});

describe("structured checkout address", () => {
  const request = {
    cartId: "11111111-1111-4111-8111-111111111111",
    fulfillmentType: "shipping",
    country: "US",
    address: " 12 Main St ",
    recipientName: " Alex Chen ",
    line2: " Apt 4 ",
    city: " Oakland ",
    region: "CA",
    postalCode: "94612",
  };
  it("retains separate fields through quote parsing", () => {
    expect(parseQuoteRequest(request)).toMatchObject({
      recipientName: "Alex Chen",
      address: "12 Main St",
      line2: "Apt 4",
      city: "Oakland",
    });
  });
  it.each([
    { recipientName: [] },
    { line2: "x".repeat(201) },
    { city: "x".repeat(201) },
  ])("rejects malformed address additions", (extra) => {
    expect(() => parseQuoteRequest({ ...request, ...extra })).toThrow();
  });
  it("renders all structured address details and still supports older quotes", () => {
    const html = renderToStaticMarkup(
      <ShippingAddress
        locale="en"
        address={{
          country: "US",
          address: "12 Main St",
          recipientName: "Alex Chen",
          line2: "Apt 4",
          city: "Oakland",
          region: "CA",
          postalCode: "94612",
        }}
      />,
    );
    expect(html).toContain(
      "Alex Chen, 12 Main St, Apt 4, Oakland, California, 94612",
    );
    expect(
      renderToStaticMarkup(
        <ShippingAddress
          locale="en"
          address={{ country: "US", address: "Legacy address" }}
        />,
      ),
    ).toContain("Legacy address");
  });
});
