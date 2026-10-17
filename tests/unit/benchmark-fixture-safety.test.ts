import { expect, it } from "vitest";
import { assertFixtureTarget } from "../../scripts/benchmark/fixture-target";
import {
  benchmarkImages,
  benchmarkImageForKey,
} from "../../scripts/benchmark/images.mjs";
import { inflateSync } from "node:zlib";

const url =
  "postgresql://postgres:postgres@127.0.0.1:25449/supastore_cuj_1792200000000";
const token = "318ee7fa-b7e9-4aef-a809-6a3cf1e3eb12";
it("accepts only explicit synthetic database targets and an ownership token", () => {
  expect(assertFixtureTarget(url, token)).toBe("supastore_cuj_1792200000000");
});
it.each([
  url.replace("127.0.0.1", "production.example"),
  url.replace(":25449", ":5432"),
  url.replace("supastore_cuj_1792200000000", "supastore"),
  url + "?host=production.example",
  url + "#ignored",
  url.replace("postgresql:", "https:"),
  url.replace("postgres:postgres", "owner:secret"),
  url.replace("127.0.0.1", "localhost"),
])("refuses a non-owned or overridable connection target %#", (target) => {
  expect(() => assertFixtureTarget(target, token)).toThrow(
    "Invalid benchmark fixture target",
  );
});
it("rejects absent ownership before opening a database connection", () => {
  expect(() => assertFixtureTarget(url, "")).toThrow(
    "Invalid benchmark fixture target",
  );
});
it("provides deterministic real PNG payloads with recorded sizes and dimensions", () => {
  expect(benchmarkImages).toHaveLength(2);
  for (const image of benchmarkImages) {
    expect(image.bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(image.bytes.readUInt32BE(16)).toBe(1200);
    expect(image.bytes.readUInt32BE(20)).toBe(900);
    expect(image.bytes.length).toBeGreaterThan(50000);
    expect(image.bytes.length).toBeLessThan(400000);
    const idatLength = image.bytes.readUInt32BE(33);
    expect(inflateSync(image.bytes.subarray(41, 41 + idatLength)).length).toBe(
      900 * (1200 * 3 + 1),
    );
    expect(image.sha256).toMatch(/^[0-9a-f]{64}$/);
  }
  expect(benchmarkImages[0]!.sha256).not.toBe(benchmarkImages[1]!.sha256);
});
it("serves only designated benchmark image keys", () => {
  expect(
    benchmarkImageForKey(
      "/browser-public-fixture/catalog/318ee7fa-b7e9-4aef-a809-6a3cf1e3eb12/b3000000-0000-4000-8000-000000000001.png",
    ),
  ).toBe(benchmarkImages[0]);
  expect(
    benchmarkImageForKey("/browser-private-fixture/catalog/missing.png"),
  ).toBeUndefined();
  expect(
    benchmarkImageForKey(
      "/browser-public-fixture/catalog/../b3000000-0000-4000-8000-000000000001.png",
    ),
  ).toBeUndefined();
});
