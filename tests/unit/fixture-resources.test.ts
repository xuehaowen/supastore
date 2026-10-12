import { expect, it } from "vitest";
import { measureFixtureResources } from "../../scripts/measure-fixture-resources.mjs";
it("rejects untrusted process identifiers and unknown services", () => {
  expect(() =>
    measureFixtureResources([{ service: "backend", pid: -1 }]),
  ).toThrow("Invalid fixture process");
  expect(() =>
    measureFixtureResources([{ service: "unknown", pid: process.pid }]),
  ).toThrow("Invalid fixture process");
});
it.skipIf(!["win32", "linux"].includes(process.platform))(
  "reads the current owned process RSS",
  () => {
    const [record] = measureFixtureResources([
      { service: "backend", pid: process.pid },
    ]);
    expect(record!.rssBytes).toBeGreaterThan(0);
    expect(record!.peakRssBytes).toBeGreaterThanOrEqual(record!.rssBytes);
  },
);
