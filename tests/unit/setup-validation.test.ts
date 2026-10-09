import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/infrastructure/db", () => ({
  db: { transaction: mocks.transaction },
}));
import { configureShipping } from "@/application/use-cases/store/configure-shipping";
import { updateStoreSettings } from "@/application/use-cases/store/update-store-settings";
import { createProduct } from "@/application/use-cases/catalog/create-product";
beforeEach(() => vi.resetAllMocks());
describe("admin configuration validates before persistence", () => {
  it.each([
    { countryCodes: ["US"], regionCodes: ["ZZ"] },
    { countryCodes: ["US"], regionCodes: ["CALIFORNIA"] },
    { countryCodes: null, regionCodes: ["CA"] },
    { countryCodes: ["US", "CA"], postalPrefixes: ["941"] },
    { countryCodes: ["US"], postalPrefixes: ["94*"] },
  ])("rejects invalid regional shipping rules %j", async (rule) => {
    await expect(
      configureShipping({
        staffUserId: "owner",
        zones: [{ name: "Region", rateCents: 800, ...rule }],
      }),
    ).rejects.toThrow();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each(["", " "])("rejects empty timezone %j", async (timezone) => {
    await expect(
      updateStoreSettings({ staffUserId: "owner", timezone }),
    ).rejects.toThrow();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each(["name", "address"] as const)("requires pickup %s", async (field) => {
    await expect(
      configureShipping({
        staffUserId: "owner",
        pickup: {
          name: "Studio",
          address: "1 Test Street",
          weeklySchedule: { mon: [["09:00", "17:00"]] },
          [field]: " ",
        },
      }),
    ).rejects.toThrow();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("requires a shipping zone name", async () => {
    await expect(
      configureShipping({
        staffUserId: "owner",
        zones: [{ name: " ", rateCents: 0 }],
      }),
    ).rejects.toThrow();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each(["title", "sku", "variantTitle"])(
    "requires product %s",
    async (field) => {
      await expect(
        createProduct({
          staffUserId: "owner",
          handle: "product",
          title: field === "title" ? " " : "Product",
          variants: [
            {
              sku: field === "sku" ? " " : "SKU",
              title: field === "variantTitle" ? " " : "Default",
              priceCents: 1,
            },
          ],
        }),
      ).rejects.toThrow();
      expect(mocks.transaction).not.toHaveBeenCalled();
    },
  );
  it("rejects prices beyond database integer capacity", async () => {
    await expect(
      createProduct({
        staffUserId: "owner",
        handle: "product",
        title: "Product",
        variants: [{ sku: "SKU", title: "Default", priceCents: 2147483648 }],
      }),
    ).rejects.toThrow();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
