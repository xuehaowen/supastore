import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CatalogImageUpload } from "@/app/admin/catalog-image-upload";
import { uploadCatalogImages } from "@/app/admin/catalog-image-batch";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const request = vi.fn<typeof fetch>();
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  request.mockReset();
  vi.stubGlobal("fetch", request);
});
const image = (name: string) => ({
  file: new File(["image"], name, { type: "image/png" }),
  altText: `Description of ${name}`,
  status: "pending" as const,
});
const target = {
  entityType: "product" as const,
  entityId: "product",
  variantId: "variant",
};

it("allows multiple product files while keeping collection covers single-file", () => {
  const product = renderToStaticMarkup(
    <CatalogImageUpload entityType="product" entityId="product" />,
  );
  const collection = renderToStaticMarkup(
    <CatalogImageUpload entityType="collection" entityId="collection" />,
  );
  expect(product.match(/<input[^>]*type="file"[^>]*>/)?.[0]).toContain(
    'multiple=""',
  );
  expect(collection.match(/<input[^>]*type="file"[^>]*>/)?.[0]).not.toContain(
    "multiple",
  );
});

it("uploads sequentially with each file's description and the selected variant", async () => {
  let completeFirst!: () => void;
  request
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          completeFirst = () => resolve(Response.json({ saved: true }));
        }),
    )
    .mockResolvedValue(Response.json({ saved: true }));
  const images = [image("front.png"), image("back.png")];
  const pending = uploadCatalogImages(target, images);
  expect(request).toHaveBeenCalledTimes(1);
  completeFirst();
  const result = await pending;
  expect(result.map((item) => item.status)).toEqual(["uploaded", "uploaded"]);
  expect(request).toHaveBeenCalledTimes(2);
  for (const [index, [, init]] of request.mock.calls.entries()) {
    const body = init!.body as FormData;
    expect(body.get("file")).toEqual(images[index]!.file);
    expect(body.get("altText")).toBe(images[index]!.altText);
    expect(body.get("variantId")).toBe("variant");
    expect(body.get("entityId")).toBe("product");
  }
});

it("retains successes, continues after failures, and retries only failed images", async () => {
  request
    .mockResolvedValueOnce(Response.json({ saved: true }))
    .mockResolvedValueOnce(
      Response.json({ error: "Storage unavailable." }, { status: 400 }),
    )
    .mockResolvedValueOnce(Response.json({ saved: true }));
  const result = await uploadCatalogImages(target, [
    image("one.png"),
    image("two.png"),
    image("three.png"),
  ]);
  expect(result.map((item) => item.status)).toEqual([
    "uploaded",
    "failed",
    "uploaded",
  ]);
  expect(result[1]!.error).toBe("Storage unavailable.");
  request.mockResolvedValueOnce(Response.json({ saved: true }));
  const retried = await uploadCatalogImages(target, result);
  expect(request).toHaveBeenCalledTimes(4);
  expect((request.mock.calls[3]![1]!.body as FormData).get("file")).toEqual(
    result[1]!.file,
  );
  expect(retried.every((item) => item.status === "uploaded")).toBe(true);
});

it("rejects oversized, unsupported and undescribed files before sending them", async () => {
  const large = {
    ...image("large.png"),
    file: new File([new Uint8Array(5 * 1024 * 1024)], "large.png", {
      type: "image/png",
    }),
  };
  const unsupported = {
    ...image("bad.svg"),
    file: new File(["svg"], "bad.svg", { type: "image/svg+xml" }),
  };
  const results = await uploadCatalogImages(target, [
    large,
    unsupported,
    { ...image("blank.png"), altText: " " },
  ]);
  expect(results.every((item) => item.status === "failed" && item.error)).toBe(
    true,
  );
  expect(request).not.toHaveBeenCalled();
});

it("bounds batch selection and prevents batches from replacing a collection cover repeatedly", async () => {
  await expect(
    uploadCatalogImages(
      target,
      Array.from({ length: 21 }, () => image("image.png")),
    ),
  ).rejects.toThrow("20");
  await expect(
    uploadCatalogImages({ entityType: "collection", entityId: "collection" }, [
      image("one.png"),
      image("two.png"),
    ]),
  ).rejects.toThrow("one image");
  expect(request).not.toHaveBeenCalled();
});

it("reports network failures and invalid success responses without claiming an upload succeeded", async () => {
  request
    .mockRejectedValueOnce(new Error("Connection lost."))
    .mockResolvedValueOnce(Response.json({ unexpected: true }));
  const result = await uploadCatalogImages(target, [
    image("one.png"),
    image("two.png"),
  ]);
  expect(result.map((item) => item.status)).toEqual(["failed", "failed"]);
  expect(result[0]!.error).toBe("Connection lost.");
});
