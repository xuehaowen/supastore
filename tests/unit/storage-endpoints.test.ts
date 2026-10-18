import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function storageModule(publicEndpoint: string) {
  vi.resetModules();
  vi.stubEnv("S3_ENDPOINT", "http://rustfs:9000");
  vi.stubEnv("S3_PUBLIC_ENDPOINT", publicEndpoint);
  vi.stubEnv("S3_REGION", "us-east-1");
  vi.stubEnv("S3_ACCESS_KEY_ID", "synthetic-access");
  vi.stubEnv("S3_SECRET_ACCESS_KEY", "synthetic-secret");
  vi.stubEnv("S3_BUCKET_PRIVATE", "private-fixture");
  vi.stubEnv("S3_BUCKET_PUBLIC", "catalog-fixture");
  return import("@/infrastructure/storage");
}

it("signs browser URLs for the public endpoint while retaining internal storage access", async () => {
  const module = await storageModule("http://localhost:9009");
  for (const [signed, path, expiry] of [
    [await module.presignDownload("proof.png"), "/private-fixture/proof.png", "60"],
    [await module.presignUpload("upload.png", "image/png", 100), "/private-fixture/upload.png", "900"],
    [await module.presignAsset("catalog.png"), "/catalog-fixture/catalog.png", "300"],
  ]) {
    const url = new URL(signed!);
    expect(url.origin).toBe("http://localhost:9009");
    expect(url.pathname).toBe(path);
    expect(url.searchParams.get("X-Amz-Expires")).toBe(expiry);
  }
  expect((await module.storage.config.endpoint!()).hostname).toBe("rustfs");
});

it("keeps inline image fetches internal even with a public signing endpoint", async () => {
  const module = await storageModule("http://localhost:9009");
  expect(new URL(await module.presignAsset("catalog.png", { internal: true })).origin).toBe("http://rustfs:9000");
});

it("preserves single-endpoint deployments when no public endpoint is configured", async () => {
  const module = await storageModule("");
  expect(new URL(await module.presignDownload("proof.png")).origin).toBe("http://rustfs:9000");
  expect(new URL(await module.presignAsset("catalog.png")).origin).toBe("http://rustfs:9000");
});
