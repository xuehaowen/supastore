import { describe, expect, it } from "vitest";
import { updateProduct, type UpdateProductInput } from "@/application/use-cases/catalog/update-product";
const input: UpdateProductInput = {
  staffUserId: "owner", productId: "11111111-1111-4111-8111-111111111111", quoteVersion: 1,
  title: "Product", handle: "product", description: "", categoryIds: [], zhTitle: "", zhDescription: "", images: [],
  variants: [{ id: "22222222-2222-4222-8222-222222222222", sku: "SKU", title: "Default", priceCents: 100 }],
};
describe("product edit validation", () => {
  it("rejects negative or fractional prices before writing", async () => {
    for (const priceCents of [-1, 1.5]) await expect(updateProduct({ ...input, variants: [{ ...input.variants[0]!, priceCents }] })).rejects.toThrow("Variant price");
  });
  it("rejects duplicate variants and malformed handles", async () => {
    await expect(updateProduct({ ...input, variants: [input.variants[0]!, input.variants[0]!] })).rejects.toThrow("must be unique");
    await expect(updateProduct({ ...input, handle: "../invalid" })).rejects.toThrow("URL handle");
  });
  it("requires the Chinese title before saving a description", async () => {
    await expect(updateProduct({ ...input, zhDescription: "Description only" })).rejects.toThrow("Chinese title");
  });
});
